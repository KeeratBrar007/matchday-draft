# Builds a test copy of the app (tests/site/) from the real files at the top of the repo.
# The test copy talks to a pretend database (no internet, no real Firebase).
import os, re, shutil, glob, hashlib
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
site = os.path.join(here, 'site'); shutil.rmtree(site, ignore_errors=True); os.makedirs(site)
src = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
src, n = re.subn(r'const FIREBASE_CONFIG = (null|\{[\s\S]*?\});', 'const FIREBASE_CONFIG = {projectId:"mock"};', src, count=1)
assert n == 1, 'could not find FIREBASE_CONFIG in index.html'
src, n = re.subn(r'<meta name="md-build" content="[^"]*">', '<meta name="md-build" content="testbuild1">', src, count=1)
assert n == 1, 'could not find the md-build tag in index.html'
# the tests need *a* host code. A made-up one is used and the test copy's host fingerprint
# is swapped to match it, so your real host code is never needed here.
hc = os.path.join(here, '.hostcode')
if not os.path.exists(hc): open(hc, 'w').write('ci-test-code-123')
code = open(hc).read().strip()
src, n = re.subn(r"const HOST_HASH = '[0-9a-f]{64}';", "const HOST_HASH = '%s';" % hashlib.sha256(code.encode()).hexdigest(), src, count=1)
assert n == 1, 'could not find HOST_HASH in index.html'
open(os.path.join(site, 'index.html'), 'w', encoding='utf-8').write(src)
for pat in ('sw.js', 'manifest.webmanifest', '*.png', '*.svg'):
    for f in glob.glob(os.path.join(root, pat)): shutil.copy(f, site)
print('test site ready:', sorted(os.listdir(site)))
