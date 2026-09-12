import pathlib,hashlib,json,re
from bs4 import BeautifulSoup
root=pathlib.Path(__file__).resolve().parent/'release'
expected={'app-3.0.js':'b61723516ee92e623c9adcf4037643c7fbedf0953e93803ed8d16efec0af6a82','app-3.0.css':'43acd41f1722caf2b712bf6d15600545d5f9046ce4754d598a5cf9ce19724e75','sw.js':'291279114cdf045f15d4a719a3dbb24aeee29908e5c89fc0abf6d9c646751e91','manifest.json':'34360e9de0594bee3d76f2718d34bf040e4b553c05a1679bf30f7a68b52680c4'}
for name,digest in expected.items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest, 'Build differs from tested file: '+name
html=BeautifulSoup((root/'index.html').read_text(),'html.parser')
scripts=html.select('script[src]')
assert len(scripts)==1 and scripts[0]['src'].startswith('./app-3.0.js?v=')
assert 'Version 3.0' in html.get_text()
assert not html.select('#dayStatus')
js=(root/'app-3.0.js').read_text()
assert 'MutationObserver' not in js
assert js.count('setInterval(')==1
sw=(root/'sw.js').read_text()
assert 'withPatches' not in sw
for e in html.select('[src],link[href]'):
    val=e.get('src',e.get('href',''))
    if val.startswith(('http:','https:','data:')): continue
    assert (root/val.split('?')[0]).exists(), val
print('PASS: file hashes match local tested 3.0, assets present, one JS file, no MutationObserver/retry loop, one sync clock.')
