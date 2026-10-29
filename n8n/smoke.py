import http.cookies,json,pathlib,urllib.request
BASE='http://127.0.0.1:8083';cookie=''
def request(path,method='GET',data=None):
 headers={'Content-Type':'application/json','Host':'ai.th.io.vn','Origin':'https://ai.th.io.vn'}
 if cookie:headers['Cookie']=cookie
 req=urllib.request.Request(BASE+path,method=method,headers=headers,data=json.dumps(data).encode() if data is not None else None)
 with urllib.request.urlopen(req,timeout=120) as response:return json.load(response),response.headers
ready,_=request('/api/ready');assert ready['status']=='ready'
value,headers=request('/rest/owner/setup','POST',{'email':'owner@example.test','firstName':'CI','lastName':'Owner','password':'CI-only-Strong-12345!'})
cookies=http.cookies.SimpleCookie();[cookies.load(row) for row in headers.get_all('Set-Cookie',[])];cookie='; '.join(k+'='+v.value for k,v in cookies.items());assert cookie
value,_=request('/rest/credentials','POST',{'name':'CI Private Memory','type':'postgres','data':{'host':'ai-agent-db-1','database':'th_n8n','user':'postgres','password':'ci-only','port':5432,'ssl':'disable','sshTunnel':False}});memory=value.get('data',value)
workflow=json.loads(pathlib.Path(__file__).with_name('workflow.json').read_text());workflow.pop('id',None)
for node in workflow['nodes']:
 if node['type'].endswith('.memoryPostgresChat'):node['credentials']={'postgres':{'id':memory['id'],'name':'CI Private Memory'}}
value,_=request('/rest/workflows','POST',workflow);created=value.get('data',value);assert created['id'];assert created['active'] is False;assert len(created['nodes'])==len(workflow['nodes'])
value,_=request('/rest/workflows/'+created['id']);stored=value.get('data',value);assert stored['name']==workflow['name'];assert stored['connections']==workflow['connections']
# Verify the pinned runtime recognizes each standard node type and version.
types,_=request('/types/nodes.json');types=types if isinstance(types,list) else types.get('data',types.get('nodeTypes',[]))
for node in workflow['nodes']:
 candidates=[n for n in types if n.get('name')==node['type']]
 if not candidates and node['type'].endswith('Tool'):candidates=[n for n in types if n.get('name')==node['type'][:-4]]
 assert candidates,'Unknown node type: '+node['type']
 versions=[]
 for candidate in candidates:
  version=candidate.get('version');versions.extend(version if isinstance(version,list) else [version])
 assert node['typeVersion'] in versions,(node['name'],node['typeVersion'],versions)
# Owner setup cannot be taken over by a second visitor.
try:
 request('/rest/owner/setup','POST',{'email':'other@example.test','firstName':'Other','lastName':'Account','password':'CI-only-Strong-12345!'})
 raise AssertionError('Owner setup was still open')
except urllib.error.HTTPError as error:assert error.code in [400,403]
print(json.dumps({'n8nImportVerified':True,'nodes':len(workflow['nodes']),'ownerSetupClosed':True,'privateMemoryCredential':True,'externalModelCalls':0}))
