/* ===== کلوپ مشتریان (بلوک جدید؛ زیر خط const save2=o=>sv(K,o); در admin2.html قرار بده) ===== */
const toEn=s=>String(s||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
const normPh=s=>{let d=toEn(s).replace(/\D/g,"");if(d.startsWith("0098"))d=d.slice(4);else if(d.length==12&&d.startsWith("98"))d=d.slice(2);if(d.length==10&&d[0]=="9")d="0"+d;return /^09\d{9}$/.test(d)?d:""};
let G=0,CQ=null,CSEQ=0,CT=null;
function clubSync(){clearTimeout(CT);if(!normPh($("#cph").value)){CQ=null;paintClub();return}paintClub();CT=setTimeout(clubQuote,300)}
async function clubQuote(){
  const ph=normPh($("#cph").value),g=G,seq=++CSEQ;
  if(!ph){CQ=null;paintClub();return CQ}
  let r=null;
  try{r=await DB.club({action:"clubQuote",phone:ph,gross:g,want:$("#cuse").checked?1e9:0})}catch(e){}
  if(seq!=CSEQ)return CQ;
  CQ=r&&r.ok?{...r,ph,g}:{err:1,ph,g};
  paintClub();return CQ;
}
function paintClub(){
  const raw=$("#cph").value.trim(),ph=normPh(raw),q=CQ&&CQ.ph==ph?CQ:null,info=$("#cinfo");
  let net=G,dis="";$("#cconw").hidden=true;$("#cusew").hidden=true;
  if(!raw)info.textContent="";
  else if(!ph)info.textContent="شمارهٔ موبایل معتبر نیست";
  else if(!q)info.textContent="در حال بررسی…";
  else if(q.err)info.textContent="⚠️ ارتباط با کلوپ برقرار نیست";
  else{
    const m=q.member;
    info.textContent=m?`⭐ ${m.name||"عضو"} · سطح ${m.lv} · ${fa(m.bal)} امتیاز`:"عضو جدید؛ بعد از تحویل سفارش عضو می‌شود";
    $("#cconw").hidden=!!m;
    if(q.q.maxP>0){$("#cusew").hidden=false;$("#cusel").textContent="استفاده از امتیاز (تا "+fa(q.q.maxP)+" امتیاز)"}
    if(q.g===G){const Q=q.q;net=Q.net;dis=[Q.dl?`تخفیف سطح ${Q.lv}: −${fa(Q.dl)}`:"",Q.dp?`تخفیف امتیاز: −${fa(Q.dp)}`:"",Q.earn?`امتیاز این سفارش: +${fa(Q.earn)}`:""].filter(Boolean).join(" · ")}
  }
  $("#cdisc").textContent=dis;$("#sum").textContent=fa(net)+" تومان";
}
/* فیلدهای کلوپ برای ذخیره روی سفارش؛ false یعنی ثبت متوقف شود */
async function clubFields(gross){
  const none={ph:"",cn:0,cnm:"",gross,dl:0,dp:0,rp:0,lv:""},raw=$("#cph").value.trim();
  if(!raw)return none;
  if(!normPh(raw)){alert("شمارهٔ موبایل معتبر نیست");$("#cph").focus();return false}
  const q=await clubQuote();
  if(!q||q.err||q.g!==gross)return confirm("ارتباط با کلوپ برقرار نیست. سفارش بدون کلوپ ثبت شود؟")?none:false;
  if(!q.member&&!$("#ccon").checked){alert("برای عضو جدید باید تیک «رضایت مشتری» زده شود");return false}
  const Q=q.q;
  return{ph:q.ph,cn:$("#ccon").checked?1:0,cnm:$("#cnm").value.trim().slice(0,40),gross,dl:Q.dl,dp:Q.dp,rp:Q.pts,lv:Q.lv};
}
const clubReverseP=id=>DB.club({action:"clubReverse",orderId:id}).catch(()=>null);
function clubReverse(id){const o=ld(K).find(r=>r.id==id);if(o&&o.cs)clubReverseP(id)}
function clubLoad(x){$("#cph").value=x.ph||"";$("#cnm").value=x.cnm||"";$("#ccon").checked=!!x.cn;$("#cuse").checked=!!x.rp}
function clubReset(){$("#cph").value="";$("#cnm").value="";$("#ccon").checked=false;$("#cuse").checked=false;CQ=null}
/* بعد از «تحویل داده شد»: امتیاز و تخفیف در سرور نهایی می‌شود (هر سفارش فقط یک‌بار) */
async function clubSettle(id){
  const o=ld(K).find(r=>r.id==id);if(!o||!o.ph||o.cs||o.s!=3)return;
  try{
    const r=await DB.club({action:"clubSettle",consent:!!o.cn,order:{id:o.id,ph:o.ph,gross:o.gross||o.sum,want:o.rp||0,name:o.cnm||""}});
    if(!r||!r.ok)throw 0;
    const all=ld(K),x=all.find(q=>q.id==id);if(!x)return;
    x.cs=1;x.ep=r.earn;
    const diff=r.dl!==x.dl||r.dp!==x.dp;
    if(diff){x.dl=r.dl;x.dp=r.dp;x.rp=r.pts;x.sum=r.net}
    sv(K,all);if(diff)reinvoice(x);
    renderOrders();toast(diff?"⚠️ تخفیف کلوپ با موجودی فعلی اصلاح شد":"⭐ "+fa(r.earn)+" امتیاز ثبت شد",diff);
  }catch(e){toast("ثبت امتیاز انجام نشد؛ دکمهٔ «ثبت امتیاز» را بزن",true);renderOrders()}
}
const clubLine=o=>!o.ph?"":`<div class="pay"><span class="pst ${o.cs?"paid":"none"}">⭐ ${esc(o.ph)}</span>${(o.dl||0)+(o.dp||0)?`<span class="mut">تخفیف کلوپ ${fa((o.dl||0)+(o.dp||0))}</span>`:""}${o.cs?`<span class="mut">+${fa(o.ep||0)} امتیاز</span>`:o.s==3?`<button class="pb" data-cretry="${o.id}">🔄 ثبت امتیاز</button>`:`<span class="mut">پس از تحویل ثبت می‌شود</span>`}</div>`;
$("#cph").addEventListener("input",clubSync);
$("#cuse").addEventListener("change",clubQuote);
