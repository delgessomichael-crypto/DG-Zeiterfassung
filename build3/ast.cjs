const fs=require('fs');let acorn;try{acorn=require('acorn')}catch(e){acorn=require('/usr/local/slides_js/node_modules/acorn')}
const s=fs.readFileSync(process.argv[2],'utf8'),a=acorn.parse(s,{ecmaVersion:'latest'});let b=a.body;
if(b[0]?.expression?.callee?.body?.body)b=b[0].expression.callee.body.body;
console.log(JSON.stringify(b.map(n=>({type:n.type,name:n.id?.name,decls:n.declarations?.map(d=>d.id.name),source:s.slice(n.start,n.end)}))));
