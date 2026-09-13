const fs=require('fs');let acorn;try{acorn=require('acorn')}catch(e){acorn=require('/usr/local/slides_js/node_modules/acorn')}
const s=fs.readFileSync(process.argv[2],'utf8'),a=acorn.parse(s,{ecmaVersion:'latest'}),out=[];
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id?.name)out.push({type:n.type,name:n.id.name,source:s.slice(n.start,n.end)});for(const [k,v] of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'&&v.type)walk(v);}}
walk(a);console.log(JSON.stringify(out));
