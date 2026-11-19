#!/usr/bin/env python3
"""Visible Facebook browser adapter. Session stays in a private local profile."""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.parse

COMPOSE = re.compile(r'^(Create post|Create a post|Tạo bài viết|Viết bài|What.s on your mind.*|Bạn đang nghĩ gì.*)$', re.I)
POST = re.compile(r'^(Post|Đăng|Đăng bài)$', re.I)


def destination(value):
    u = urllib.parse.urlsplit(value)
    if u.scheme != 'https' or u.netloc != 'www.facebook.com' or u.query or u.fragment or not re.fullmatch(r'/[A-Za-z0-9.]{3,100}/?', u.path) or u.path.strip('/').lower() in {'login', 'logout', 'settings', 'checkpoint', 'recover', 'help'}:
        raise ValueError('Use a fixed https://www.facebook.com/PageName or numeric Page URL.')
    return u.geturl()


def profile(directory, value):
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,59}', value):
        raise ValueError('Invalid browser profile reference.')
    p = pathlib.Path(directory) / 'facebook-profiles' / value
    p.mkdir(parents=True, exist_ok=True)
    if os.name != 'nt':
        p.chmod(0o700)
    return p


def available(config):
    if config.get('enableFacebookBrowser') is not True:
        return False
    try:
        import importlib.util
        return importlib.util.find_spec('playwright') is not None
    except (ImportError, ValueError):
        return False


def context(playwright, config, directory, reference):
    channel = config.get('browserChannel', 'chrome')
    if channel not in {'chrome', 'msedge', 'chromium'}:
        raise ValueError('Choose chrome, msedge or chromium in local device settings.')
    options = {'headless': False, 'viewport': {'width': 1280, 'height': 900}, 'timeout': 12000}
    if channel != 'chromium':
        options['channel'] = channel
    return playwright.chromium.launch_persistent_context(str(profile(directory, reference)), **options)


def needs_login(page):
    return '/login' in page.url or '/checkpoint' in page.url or page.locator('input[type=password], input[name=approvals_code]').count() > 0


def composer(page):
    main = page.get_by_role('main')
    if main.count() != 1:
        return page.locator('[data-th-no-composer]')
    button = main.get_by_role('button', name=COMPOSE)
    if button.count():
        return button.first
    text = main.get_by_text(COMPOSE)
    return text.first


def local_media(config, paths):
    if not isinstance(paths, list) or len(paths) > 4:
        raise ValueError('Use at most four local image/video paths.')
    roots = [pathlib.Path(p).resolve() for p in config.get('roots', {}).values()]
    result = []
    for value in paths:
        p = pathlib.Path(value).resolve(strict=True)
        if not p.is_file() or p.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov'} or p.stat().st_size > 20 * 1024 * 1024:
            raise ValueError('Use image/video files below 20 MB.')
        if not config.get('fullControl') and not any(p.is_relative_to(root) for root in roots):
            raise ValueError('The selected media is outside the configured local roots.')
        result.append(str(p))
    return result


def receipt_links(page, caption, recent=False):
    links = set()
    for article in page.get_by_role('article').all()[:15]:
        if caption[:120] not in article.inner_text(timeout=1500):
            continue
        for item in article.locator('a[href]').evaluate_all('(xs)=>xs.map(x=>({href:x.href,text:[x.innerText,x.getAttribute("aria-label"),x.getAttribute("title")].filter(Boolean).join(" ")}))'):
            u = urllib.parse.urlsplit(item['href'])
            fresh = re.search(r'just now|moments ago|vừa xong|vừa mới|bây giờ|\b[12]\s*(?:m|min|minute|phút)\b', item['text'], re.I)
            if (not recent or fresh) and u.hostname in {'www.facebook.com', 'facebook.com'} and ('/posts/' in u.path or '/permalink/' in u.path or 'story_fbid=' in u.query):
                links.add(item['href'])
    return links


def compose_and_publish(page, value, media):
    submitted = False
    caption = value['caption']
    try:
        trigger = composer(page)
        before = receipt_links(page, caption)
        trigger.click()
        dialog = page.get_by_role('dialog').filter(has=page.locator('[contenteditable=true][role=textbox]')).last
        expected = value.get('expectedName', '')
        if not expected or dialog.get_by_text(expected, exact=True).count() != 1:
            raise ValueError('Posting identity does not match the configured Facebook name.')
        editor = dialog.locator('[contenteditable=true][role=textbox]')
        if editor.count() != 1:
            raise ValueError('Facebook composer changed or is ambiguous. No post was submitted.')
        editor.fill(caption)
        if media:
            inputs = dialog.locator('input[type=file]')
            if not inputs.count():
                add = dialog.get_by_role('button', name=re.compile(r'Photo/video|Ảnh/video', re.I))
                add.first.click()
            dialog.locator('input[type=file]').first.set_input_files(media)
        post = dialog.get_by_role('button', name=POST, exact=True)
        post.wait_for(state='visible')
        # Intent before the click: never silently retry after this point.
        if value.get('_deadline'):
            from datetime import datetime, timezone
            if (datetime.fromisoformat(value['_deadline'].replace('Z','+00:00')) - datetime.now(timezone.utc)).total_seconds() < 12:
                raise ValueError('Task deadline reached before Post.')
        submitted = True
        post.click(timeout=8000)
        until = time.monotonic() + 10
        while time.monotonic() < until:
            found = receipt_links(page, caption, recent=True) - before
            if found:
                return {'status': 'published', 'url': sorted(found)[0], 'confirmed': True}
            page.wait_for_timeout(750)
        return {'status': 'uncertain', 'message': 'The Post button was clicked but a new matching permalink could not be confirmed. Check Facebook before retrying.'}
    except Exception:
        return {'status': 'uncertain' if submitted else 'blocked', 'message': 'Check the Facebook Page before retrying; the browser result is unconfirmed.' if submitted else 'Facebook could not prepare the approved content. Check the composer controls and media. No Post click was attempted.'}


def operate(config, directory, action, value):
    if not available(config):
        raise ValueError('Update the local agent with -EnableFacebookBrowser first.')
    url = destination(value['pageUrl'])
    reference = value['profileId']
    profile(directory, reference)
    if action == 'facebook_login':
        # Interactive child owns only this adapter profile. It receives no password/token.
        argv = [sys.executable, str(pathlib.Path(__file__).resolve()), '--login', '--directory', str(directory), '--profile', reference, '--url', url, '--channel', config.get('browserChannel', 'chrome')]
        kwargs = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL, 'stdin': subprocess.DEVNULL}
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs['start_new_session'] = True
        subprocess.Popen(argv, **kwargs)
        return {'status': 'login_opened', 'message': 'Complete sign-in/OTP in the browser on your computer, then close that automation window and Test connection again.'}
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as p:
            browser = context(p, config, directory, reference)
            try:
                page = browser.pages[0] if browser.pages else browser.new_page()
                page.set_default_timeout(6000)
                page.goto(url, wait_until='domcontentloaded', timeout=15000)
                if urllib.parse.urlsplit(page.url).hostname not in {'www.facebook.com','facebook.com'}:
                    return {'status':'blocked','message':'The browser left the configured Facebook site. No post was prepared.'}
                if needs_login(page):
                    return {'status': 'needs_login', 'message': 'Open Facebook sign-in for this connection on the paired computer. Complete login/OTP yourself, close that window and test again.'}
                trigger = composer(page)
                if not trigger.count() or not trigger.is_visible():
                    return {'status': 'blocked', 'message': 'The configured destination has no recognized Create post control. Check the Page/profile identity, permissions, language and current Facebook UI.'}
                if action == 'facebook_check':
                    trigger.click()
                    dialog = page.get_by_role('dialog').filter(has=page.locator('[contenteditable=true][role=textbox]')).last
                    dialog.wait_for(state='visible')
                    if not value.get('expectedName') or dialog.get_by_text(value['expectedName'], exact=True).count() != 1:
                        return {'status':'blocked','message':'The composer identity does not match the configured posting name. Sign in/switch to the correct identity and check the connection name settings.'}
                    return {'status': 'ready', 'authenticated': True, 'composerVisible': True, 'execution': 'desktop', 'unattended': False}
                caption = value.get('caption')
                if not isinstance(caption, str) or not caption.strip() or len(caption) > 10000:
                    raise ValueError('Provide an approved caption under 10,000 characters.')
                media = local_media(config, value.get('localPaths', [])) + value.get('_downloadedMedia', [])
                if len(media)>4:
                    raise ValueError('Use at most four media files total.')
                result = compose_and_publish(page, value, media)
                result['browserClosed'] = False
                return result
            finally:
                try:
                    browser.close()
                    if 'result' in locals(): result['browserClosed'] = True
                except Exception:
                    pass
    except Exception:
        return {'status': 'blocked', 'message': 'The visible browser could not start. Close other automation-profile windows, check browser installation/login, then test again. No Post click was attempted.'}


def login(directory, reference, url, channel):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = context(p, {'browserChannel': channel}, directory, reference)
        try:
            page = browser.pages[0] if browser.pages else browser.new_page()
            page.goto(destination(url), wait_until='domcontentloaded', timeout=30000)
            deadline = time.monotonic() + 600
            while time.monotonic() < deadline and browser.pages:
                try:
                    browser.pages[0].wait_for_timeout(1000)
                except Exception:
                    break
        finally:
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--login', action='store_true')
    parser.add_argument('--directory', required=True)
    parser.add_argument('--profile', required=True)
    parser.add_argument('--url', required=True)
    parser.add_argument('--channel', default='chrome')
    a = parser.parse_args()
    login(a.directory, a.profile, a.url, a.channel)
