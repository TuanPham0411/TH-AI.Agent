import importlib.util
import pathlib
import tempfile
import unittest
import subprocess
import sys
import json
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('fb_browser', pathlib.Path(__file__).resolve().parents[1] / 'tools/facebook-browser.py')
fb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fb)

HTML = '''<main><button onclick="document.querySelector('[role=dialog]').hidden=false">Create post</button>
<div role=dialog hidden><span>My Test Page</span><div role=textbox contenteditable=true></div><input type=file multiple><button onclick="publish()">Post</button></div><section id=feed></section></main>
<script>window.posts=0;function publish(){window.posts++;let a=document.createElement('article');a.setAttribute('role','article');a.innerText=document.querySelector('[contenteditable]').innerText;let l=document.createElement('a');l.href='https://www.facebook.com/TestPage/posts/123456';l.textContent='Just now';a.append(l);document.querySelector('#feed').append(a);document.querySelector('[role=dialog]').hidden=true;}</script>'''

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = sync_playwright().start()
        cls.browser = cls.p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.p.stop()

    def page(self):
        page = self.browser.new_page()
        page.set_default_timeout(1500)
        page.set_content(HTML)
        self.addCleanup(page.close)
        return page

    def test_real_composer_fill_upload_click_and_permalink(self):
        page = self.page()
        with tempfile.TemporaryDirectory() as folder:
            image = pathlib.Path(folder) / 'test.png'
            image.write_bytes(b'\x89PNG\r\n\x1a\nfixture')
            result = fb.compose_and_publish(page, {'caption':'An approved caption', 'expectedName':'My Test Page'}, [str(image)])
            self.assertEqual(result['status'], 'published')
            self.assertTrue(result['confirmed'])
            self.assertEqual(page.evaluate('window.posts'), 1)
            self.assertEqual(page.locator('input[type=file]').evaluate('(e)=>e.files[0].name'), 'test.png')

    def test_wrong_identity_and_expired_deadline_do_not_post(self):
        for data in [{'expectedName':'Different Page'}, {'expectedName':'My Test Page','_deadline':'2000-01-01T00:00:00Z'}]:
            page=self.page()
            result=fb.compose_and_publish(page, {'caption':'Approved',**data}, [])
            self.assertEqual(result['status'],'blocked')
            self.assertEqual(page.evaluate('window.posts'),0)

    def test_ambiguous_editor_never_posts(self):
        page=self.page()
        page.locator('[role=dialog]').evaluate("e=>{const x=document.createElement('div');x.setAttribute('role','textbox');x.contentEditable=true;e.append(x)}")
        self.assertEqual(fb.compose_and_publish(page,{'caption':'Approved','expectedName':'My Test Page'},[])['status'],'blocked')
        self.assertEqual(page.evaluate('window.posts'),0)

    def test_duplicate_existing_permalink_is_not_a_receipt(self):
        page=self.page()
        page.evaluate("publish()")
        self.assertEqual(fb.compose_and_publish(page,{'caption':'','expectedName':'My Test Page'},[])['status'],'uncertain')
        self.assertEqual(page.evaluate('window.posts'),2)

    def test_visible_adapter_lifecycle_and_login_checks_with_intercepted_browser(self):
        program = r"""
import importlib.util,json,pathlib,sys,tempfile
spec=importlib.util.spec_from_file_location('adapter',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
data=json.load(sys.stdin);closed=[]
def context(p,config,directory,reference):
    browser=p.chromium.launch_persistent_context(str(pathlib.Path(directory)/reference),headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    browser.on('close',lambda:closed.append(True))
    browser.route('**/*',lambda route:route.fulfill(content_type='text/html',body=data['html']))
    return browser
m.context=context
with tempfile.TemporaryDirectory() as folder:
    result=m.operate({'enableFacebookBrowser':True},folder,data['action'],{'pageUrl':'https://www.facebook.com/TestPage','profileId':'test_profile','expectedName':'My Test Page','caption':'Approved caption'})
    assert closed,'Automation context was not closed'
    print(json.dumps(result))
"""
        for action,html,status in [('facebook_publish',HTML,'published'),('facebook_check',HTML,'ready'),('facebook_check','<input type=password>','needs_login')]:
            result=subprocess.run([sys.executable,'-c',program,str(pathlib.Path(fb.__file__))],input=json.dumps({'html':html,'action':action}),capture_output=True,text=True,timeout=35,check=True)
            value=json.loads(result.stdout)
            self.assertEqual(value['status'],status)
            if status=='published':self.assertTrue(value['browserClosed'])

    def test_local_file_roots_and_destinations(self):
        for url in ['http://www.facebook.com/Test','https://facebook.com/Test','https://www.facebook.com/login','https://evil.example/Test','https://www.facebook.com/Test?token=x']:
            with self.assertRaises(ValueError):fb.destination(url)
        self.assertEqual(fb.destination('https://www.facebook.com/TestPage'),'https://www.facebook.com/TestPage')
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as other:
            file=pathlib.Path(other)/'a.jpg';file.write_bytes(b'image')
            with self.assertRaises(ValueError):fb.local_media({'roots':{'home':root}},[str(file)])
            self.assertEqual(fb.local_media({'roots':{'home':other}},[str(file)]),[str(file)])
        self.assertFalse(fb.available({}))

if __name__=='__main__':unittest.main()
