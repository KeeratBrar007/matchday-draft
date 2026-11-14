import json,sys
keys = json.loads(sys.argv[1]) if len(sys.argv)>1 else ["selectedIds","rsvpLog","auction","updatedAt"]
import os
t=open('mock_rules.tpl.js').read().replace('__HOSTCODE__',open('.hostcode').read().strip()).replace('__FRIEND_MATCH_KEYS__',json.dumps(keys)).replace('__V2__', 'true' if os.environ.get('V2')=='1' else 'false')
open('mock2.js','w').write(t); print('mock with friend keys',keys)
