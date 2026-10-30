// Presentation only: the original run output remains unchanged in Output/history.
export function chatAnswer(output) {
  let value=output;
  for(let depth=0;depth<4;depth++) {
    if(value&&typeof value==='object'&&!Array.isArray(value)) {
      const key=['text','report','answer'].find(k=>typeof value[k]==='string');
      if(key){value=value[key];continue;}
    }
    if(typeof value==='string'&&value.trim().startsWith('{')) {
      try {const parsed=JSON.parse(value);if(parsed&&['text','report','answer'].some(k=>typeof parsed[k]==='string')){value=parsed;continue;}}catch{}
    }
    break;
  }
  return typeof value==='string'?{kind:'text',text:value}:{kind:'json',text:JSON.stringify(value??null,null,2)};
}

// A small, inert Markdown subset. Never inserts model-supplied HTML or loads images.
export function renderAnswer(host,output) {
  const {kind,text}=chatAnswer(output),doc=host.ownerDocument;
  host.replaceChildren();host.classList.add('answer');host.dir='auto';
  const el=(tag,value)=>{const n=doc.createElement(tag);if(value!==undefined)n.textContent=value;return n;};
  if(kind==='json'){host.append(el('pre',text));return;}
  function inline(parent,source,depth=0){
    if(depth>4){parent.append(doc.createTextNode(source));return;}
    const pattern=/(`+)([^`\n]+?)\1|\*\*([^\n]+?)\*\*|__([^\n]+?)__|\[([^\]\n]+)\]\(([^\s)]+)\)|\*([^*\n]+)\*/g;
    let start=0,match;
    while((match=pattern.exec(source))){parent.append(doc.createTextNode(source.slice(start,match.index)));let n;
      if(match[1])n=el('code',match[2]);
      else if(match[3]||match[4]){n=el('strong');inline(n,match[3]||match[4],depth+1);}
      else if(match[5]){let url;try{url=new URL(match[6]);}catch{}if(url&&['https:','http:','mailto:'].includes(url.protocol)){n=el('a',match[5]);n.href=url.href;n.target='_blank';n.rel='noopener noreferrer';}else n=el('span',match[5]+' ('+match[6]+')');}
      else {n=el('em');inline(n,match[7],depth+1);}
      parent.append(n);start=pattern.lastIndex;
    }
    parent.append(doc.createTextNode(source.slice(start)));
  }
  const lines=text.replace(/\r\n?/g,'\n').split('\n');let i=0;
  const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
  const tableRule=line=>/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line||'');
  const special=index=>/^\s*$|^\s*```|^#{1,6}\s|^\s*(?:[-+*]|\d+[.)])\s|^>\s?|^\s*(?:---+|\*\*\*+)\s*$/.test(lines[index]||'')||tableRule(lines[index+1]);
  while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
    const fence=line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if(fence){i++;const code=[];while(i<lines.length&&!/^\s*```\s*$/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;const pre=el('pre'),node=el('code',code.join('\n'));if(fence[1])node.dataset.language=fence[1];pre.append(node);host.append(pre);continue;}
    const heading=line.match(/^(#{1,6})\s+(.+)$/);
    if(heading){const n=el('h'+Math.min(heading[1].length+1,6));inline(n,heading[2]);host.append(n);i++;continue;}
    if(tableRule(lines[i+1])){const wrap=el('div'),table=el('table'),head=el('thead'),row=el('tr');wrap.className='answer-table';for(const cell of cells(line)){const n=el('th');inline(n,cell);row.append(n);}head.append(row);table.append(head);i+=2;const body=el('tbody');while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){const row=el('tr');for(const cell of cells(lines[i++])){const n=el('td');inline(n,cell);row.append(n);}body.append(row);}table.append(body);wrap.append(table);host.append(wrap);continue;}
    const item=line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if(item){const ordered=/^\d/.test(item[1]),list=el(ordered?'ol':'ul');if(ordered)list.start=parseInt(item[1],10);while(i<lines.length){const m=lines[i].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);if(!m||/^\d/.test(m[1])!==ordered)break;const n=el('li');inline(n,m[2]);list.append(n);i++;}host.append(list);continue;}
    if(/^>/.test(line)){const n=el('blockquote'),parts=[];while(i<lines.length&&/^>/.test(lines[i]))parts.push(lines[i++].replace(/^>\s?/,''));inline(n,parts.join('\n'));host.append(n);continue;}
    if(/^\s*(?:---+|\*\*\*+)\s*$/.test(line)){host.append(el('hr'));i++;continue;}
    const paragraph=[line];i++;while(i<lines.length&&!special(i))paragraph.push(lines[i++]);const p=el('p');inline(p,paragraph.join('\n'));host.append(p);
  }
}
