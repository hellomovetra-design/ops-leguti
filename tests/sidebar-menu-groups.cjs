const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||require(n)});return m.exports}
const {SHIPMENT_MENUS,inShipment}=load('lib/shipment-navigation.ts');
assert.deepEqual(Array.from(SHIPMENT_MENUS,i=>i.label),['Data Barkur','Data Problem','Damage Case']);for(const item of SHIPMENT_MENUS)assert(inShipment(item.href));assert(inShipment('/dashboard/ops-desk/ots'));assert(!inShipment('/dashboard/ops-desk'));assert(!inShipment('/dashboard/ops-desk/problems-other'));
let pathname='/dashboard/ops-desk',state,initialized=false,effect,navigations=0;
const group=load('components/sidebar-menu-group.tsx',{'next/link':()=>null,'next/navigation':{usePathname:()=>pathname},react:{useId:()=> 'test-menu',useEffect:fn=>{effect=fn},useState:initial=>{if(!initialized){state=initial;initialized=true}return[state,fn=>{state=typeof fn==='function'?fn(state):fn}]}},'@/lib/utils':{cn:(...v)=>v.filter(Boolean).join(' ')}}).SidebarMenuGroup;
const props={label:'ALL CASE Shipment',icon:()=>null,items:SHIPMENT_MENUS,active:false,onNavigate:()=>navigations++};
let tree=group(props),button=tree.props.children[0];assert.equal(button.type,'button');assert.equal(button.props.href,undefined);assert.equal(button.props['aria-expanded'],false);
button.props.onClick();tree=group(props);assert.equal(tree.props.children[0].props['aria-expanded'],true);assert.equal(pathname,'/dashboard/ops-desk');assert.equal(navigations,0,'Parent expansion must not navigate or close mobile sidebar');
const links=tree.props.children[1].props.children;assert.equal(links.length,3);assert.equal(links[0].props.href,'/dashboard/ops-desk/barkur');links[0].props.onClick();assert.equal(navigations,1,'Only a child closes sidebar for navigation');
tree.props.children[0].props.onClick();assert.equal(group(props).props.children[0].props['aria-expanded'],false);
pathname='/dashboard/ops-desk/damage-cases';group({...props,active:true});effect();tree=group({...props,active:true});assert.equal(tree.props.children[0].props['aria-expanded'],true);assert.equal(tree.props.children[1].props.children[2].props['aria-current'],'page');
assert(fs.readFileSync('app/dashboard/ops-desk/barkur/page.tsx','utf8').includes('<BarkurPanel/>'));
console.log('PASS: parent click expands/collapses without navigation, children have correct routes, mobile drawer stays open until child click and active route opens its group.');
