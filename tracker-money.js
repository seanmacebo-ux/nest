// Month records use keyed objects so NEST's field-level conflict merge retains
// simultaneous expenses/categories from two phones. The original pacer is kept.
(() => {
  'use strict';
  const KEY = 'nest_money_v1', FIRST = '2026-11';
  const DEFAULTS = {
    rent: {name:'Our rent', plan:11900}, mom_stop: {name:'Mom', plan:0},
    fnb_loan: {name:'FNB personal loan', plan:5000}, groceries: {name:'Groceries', plan:4000},
    electricity: {name:'Electricity + water', plan:1500}, car_pot: {name:'Car-deposit pot', plan:0}
  };
  const cash = n => Number.isFinite(+n) ? Math.max(0, Math.round(+n * 100) / 100) : 0;
  const fmt = n => (n < 0 ? '−R' : 'R') + Math.abs(n).toLocaleString('en-ZA', {maximumFractionDigits:2});
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const monthOf = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  const dateOf = d => monthOf(d) + '-' + String(d.getDate()).padStart(2,'0');
  const shift = (m, n) => { const [y, mo] = m.split('-').map(Number); return monthOf(new Date(y, mo-1+n, 1)); };
  const distance = (a,b) => (+b.slice(0,4)-+a.slice(0,4))*12 + (+b.slice(5)-+a.slice(5));
  const title = m => new Date(+m.slice(0,4), +m.slice(5)-1, 1).toLocaleDateString('en-ZA',{month:'short',year:'numeric'});
  const loanDue = (s,m) => distance(s.loan.start,m) >= 0 && distance(s.loan.start,m) < 12;
  function migrate(old = {}) {
    const categories = Object.fromEntries(Object.entries(DEFAULTS).map(([k,v]) => [k,{name:v.name}]));
    const rows = {};
    // Include unknown legacy rows as well as the known defaults.
    for (const k of new Set([...Object.keys(DEFAULTS), ...Object.keys(old.rows || {})])) {
      const r = old.rows?.[k], d = DEFAULTS[k];
      categories[k] ||= {name:k};
      rows[k] = {plan:cash(r?.amt ?? d?.plan ?? 0), on:r?.on == null ? true : !!r.on, recurring:true, actual:null};
    }
    return {version:1, categories, months:{[FIRST]:{income:cash(old.have ?? 52000), rows, log:{}}},
      pots:{}, subscriptions:{}, car:{goal:0, opening:0}, loan:{start:'2026-10', openingPayments:0}};
  }
  function preview(s,m) {
    if (s.months[m]) return s.months[m];
    const previous = Object.keys(s.months).filter(k => k < m).sort().at(-1);
    const source = previous ? s.months[previous] : null;
    const rows = {};
    for (const [k,r] of Object.entries(source?.rows || {})) {
      rows[k] = {plan:r.recurring ? r.plan : 0, on:r.recurring && r.on, recurring:r.recurring, actual:null};
    }
    if (rows.fnb_loan && !loanDue(s,m)) rows.fnb_loan.on = false;
    return {income:source?.income ?? 0, rows, log:{}};
  }
  function category(m,k) {
    const r = m.rows[k] || {plan:0,on:true,recurring:true,actual:null};
    const entries = Object.values(m.log).filter(e => e.category === k);
    const logged = entries.reduce((n,e) => n + cash(e.amount), 0);
    const known = r.actual != null || entries.length > 0;
    const actual = cash(r.actual) + logged;
    const plan = r.on ? cash(r.plan) : 0;
    return {...r, plan, actual, known, logged, value:known ? actual : plan};
  }
  function totals(s,m) {
    let plan=0, actual=0, used=0, known=false, car=0;
    for (const k of Object.keys(s.categories)) {
      const c=category(m,k); plan+=c.plan; actual+=c.actual; used+=c.value; known ||= c.known;
      if(k==='car_pot') car=c.value;
    }
    return {plan,actual,used,known,left:m.income-used,rate:m.income ? (m.income-used+car)/m.income*100 : null};
  }
  function insights(s,selected,now=new Date()) {
    const current=monthOf(now), cutoff=selected < current ? selected : current;
    const recorded=Object.entries(s.months).filter(([k,m]) => k<=cutoff && totals(s,m).known).sort(([a],[b]) => a.localeCompare(b));
    const average = f => recorded.length ? recorded.reduce((n,[k,m]) => n+f(m,k),0)/recorded.length : null;
    const avgSpend=average(m=>totals(s,m).used);
    const avgLeft=average(m=>totals(s,m).left);
    const avgCar=average(m=>category(m,'car_pot').actual);
    const balance=cash(s.car.opening)+recorded.reduce((n,[,m]) => n+category(m,'car_pot').actual,0);
    const monthsLeft=Math.max(0,distance(cutoff,'2027-06'));
    const projection=balance+(avgCar || 0)*monthsLeft;
    const paid=Math.min(12,cash(s.loan.openingPayments)+Object.entries(s.months).filter(([k])=>k<=cutoff).reduce((n,[,m]) => n+category(m,'fnb_loan').actual/5000,0));
    const m=preview(s,selected), t=totals(s,m);
    const days=new Date(+selected.slice(0,4),+selected.slice(5),0).getDate();
    const elapsed=selected===current ? now.getDate() : selected<current ? days : 0;
    const remaining=days-elapsed;
    // Exclude future-dated logs from pace; manual actuals are declared spent-to-date.
    const dated=Object.values(m.log).filter(e=>e.date<=dateOf(now)).reduce((n,e)=>n+cash(e.amount),0);
    const manual=Object.values(m.rows).reduce((n,r)=>n+cash(r.actual),0);
    const forecast=elapsed && t.known ? (dated+manual)/elapsed*days : null;
    const allowance=remaining>0 ? t.left/remaining : null;
    return {recorded:recorded.length,avgSpend,avgLeft,avgCar,balance,monthsLeft,projection,paid,remaining,forecast,allowance};
  }
  window.NEST_MONEY = {migrate,preview,category,totals,insights,shift,loanDue};
  const root=document.getElementById('money'); if(!root) return;
  let selected=monthOf(new Date()), open=new Set(['budget','quick']), pendingRender=false, pointerDown=false;
  function load() { return NEST._get(KEY,null) || migrate(NEST._get('nest_pacer',{})); }
  function change(fn) {
    // Always re-read: a sync may have landed since this form was opened.
    const s=load(); fn(s); NEST._set(KEY,s); render();
  }
  function month(s) { return s.months[selected] ||= preview(s,selected); }
  const number = (label,value,attrs='') => `<label>${label}<input type="number" inputmode="decimal" ${/\bmin=/.test(attrs)?'':'min="0"'} ${/\bstep=/.test(attrs)?'':'step="0.01"'} value="${value == null ? '' : value}" ${attrs}></label>`;
  const section = (id,name,body,summary='') => `<details class="money-section" data-section="${id}" ${open.has(id)?'open':''}><summary>${name}<small>${summary}</small></summary><div class="money-content">${body}</div></details>`;
  const metric = (label,value,sub='') => `<div class="money-metric"><span>${label}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</div>`;
  function charts(s) {
    const keys=Array.from({length:6},(_,i)=>shift(selected,i-5));
    const existing=keys.filter(k=>s.months[k]);
    if(existing.length<2) return '<p class="money-hint">Your story starts here. Save at least two months to see trends. No history has been filled in for you.</p>';
    const values=keys.map(k=>s.months[k] ? {...totals(s,s.months[k]),income:s.months[k].income} : null);
    const max=Math.max(1,...values.filter(Boolean).flatMap(v=>[v.income,v.used]));
    const bars=values.map((v,i)=>{
      const x=28+i*50;
      return `${v ? `<rect x="${x}" y="${140-v.income/max*115}" width="13" height="${v.income/max*115}" rx="3" fill="var(--home)"/><rect x="${x+16}" y="${140-v.used/max*115}" width="13" height="${v.used/max*115}" rx="3" fill="var(--primary)"/><title>${esc(title(keys[i]))}: income ${fmt(v.income)}, outflow ${fmt(v.used)}</title>` : `<text x="${x+14}" y="130" text-anchor="middle">·</text>`}<text x="${x+14}" y="160" text-anchor="middle">${title(keys[i]).split(' ')[0]}</text>`;
    }).join('');
    const rates=values.map(v=>v?.rate ?? null), valid=rates.filter(v=>v!=null);
    const lo=Math.min(0,...valid), hi=Math.max(100,...valid), y=v=>125-(v-lo)/(hi-lo)*100;
    // Missing months break the line instead of implying observations.
    let prev=null;
    const line=rates.map((v,i)=>{
      if(v==null){prev=null;return '';}
      const x=42+i*50,cy=y(v),segment=prev ? `<path d="M${prev.x},${prev.y} L${x},${cy}" fill="none" stroke="var(--home)" stroke-width="3"/>` : '';
      prev={x,y:cy}; return `${segment}<circle cx="${x}" cy="${cy}" r="4" fill="var(--home)"/><text x="${x}" y="${cy-10}" text-anchor="middle">${Math.round(v)}%</text>`;
    }).join('');
    const rows=keys.map((k,i)=>values[i] ? `<tr><th>${title(k)}</th><td>${fmt(values[i].income)}</td><td>${fmt(values[i].used)}</td><td>${values[i].rate==null?'—':Math.round(values[i].rate)+'%'}</td></tr>` : '').join('');
    return `<p class="money-hint"><i class="legend income"></i> Income <i class="legend spend"></i> Outflow · actuals where entered, otherwise plan. Includes savings transfers.</p><svg class="money-chart" viewBox="0 0 340 175" role="img" aria-label="Income and outflow for the last six months">${bars}</svg><h4>Savings rate</h4><p class="money-hint">Income less costs, before car-pot transfers, as a percentage of income. Negative means overspending.</p><svg class="money-chart" viewBox="0 0 340 175" role="img" aria-label="Savings rate over the last six months"><path d="M25,${y(0)} H320" stroke="var(--line)"/>${line}${keys.map((k,i)=>`<text x="${42+i*50}" y="160" text-anchor="middle">${title(k).split(' ')[0]}</text>`).join('')}</svg><details><summary>Chart numbers</summary><div class="money-table"><table><thead><tr><th>Month</th><th>Income</th><th>Outflow</th><th>Rate</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }
  function movers(s,m) {
    const prev=s.months[shift(selected,-1)];
    if(!prev) return '<p class="money-hint">Save the previous month to compare categories.</p>';
    const changes=Object.entries(s.categories).map(([k,c])=>{
      const a=category(prev,k), b=category(m,k), delta=b.value-a.value;
      return {name:c.name,delta,base:a.value,estimated:!a.known||!b.known};
    }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    const describe=c=>`${c.delta>0?'▲':c.delta<0?'▼':'•'} ${fmt(Math.abs(c.delta))} · ${c.base ? Math.round(Math.abs(c.delta)/c.base*100)+'%' : c.delta ? 'new from R0' : '0%'}${c.estimated?' · plan fallback':''}`;
    return `<p class="money-callout">${changes[0]?.delta ? `Biggest mover: <b>${esc(changes[0].name)}</b> ${describe(changes[0])}` : 'No category changes from last month.'}</p><ul class="money-list">${changes.map(c=>`<li><span>${esc(c.name)}</span><small class="${c.delta>0?'money-over':c.delta<0?'money-good':''}">${describe(c)}</small></li>`).join('')}</ul>`;
  }
  function render() {
    const focused=document.activeElement;
    if(pointerDown) {pendingRender=true;return;}
    if(root.contains(focused) && /INPUT|SELECT|TEXTAREA/.test(focused.tagName) && focused.type!=='checkbox') {pendingRender=true;return;}
    pendingRender=false;
    const drafts=[...root.querySelectorAll('form')].filter(f=>!f.dataset.clearDraft && (f.id!=='expense-form' || f.elements.amount.value || f.elements.note.value)).map(f=>[f.id,[...new FormData(f).entries()]]);
    root.querySelectorAll('[data-section]').forEach(d=>d.open?open.add(d.dataset.section):open.delete(d.dataset.section));
    const s=load(), m=preview(s,selected), t=totals(s,m), a=insights(s,selected), started=!!s.months[selected];
    const options=Object.entries(s.categories).map(([k,c])=>`<option value="${esc(k)}">${esc(c.name)}</option>`).join('');
    const budget=Object.entries(s.categories).map(([k,c])=>{
      const r=m.rows[k] || {plan:0,on:true,recurring:true,actual:null}, v=category(m,k), diff=v.actual-v.plan;
      const expired=k==='fnb_loan'&&!loanDue(s,selected);
      return `<article class="budget-row" data-category="${esc(k)}"><div class="budget-title"><label><input type="checkbox" data-field="on" ${r.on?'checked':''}> ${esc(c.name)}</label><label class="repeat"><input type="checkbox" data-field="recurring" ${r.recurring?'checked':''}> Repeat</label></div>${expired?'<small class="money-hint">Outside the 12 scheduled loan payments.</small>':''}<div class="money-fields">${number('Plan · R',r.plan,`data-field="plan" aria-label="${esc(c.name)} plan"`)}${number('Other actual · R',r.actual,`data-field="actual" placeholder="Not entered" aria-label="${esc(c.name)} other actual"`)}</div><div class="budget-progress ${v.known&&diff>0?'money-over':'money-good'}"><div class="money-track"><span style="width:${Math.min(100,v.plan?v.actual/v.plan*100:v.actual?100:0)}%"></span></div><small>${v.known ? `Actual ${fmt(v.actual)}${v.logged ? ' (log '+fmt(v.logged)+')' : ''} · ${diff>0?fmt(diff)+' over':fmt(-diff)+' under'} plan` : 'No actual yet · using '+fmt(v.plan)+' plan'}</small></div></article>`;
    }).join('');
    const log=Object.entries(m.log).sort(([,a],[,b])=>b.date.localeCompare(a.date)).map(([id,e])=>`<li><div><b>${esc(s.categories[e.category]?.name || e.category)}</b><small>${esc(e.date)}${e.note?' · '+esc(e.note):''}</small></div><strong>${fmt(e.amount)}</strong><button type="button" data-delete-log="${esc(id)}" aria-label="Delete ${esc(s.categories[e.category]?.name || e.category)} expense">×</button></li>`).join('');
    const now=new Date(), date=selected===monthOf(now)?dateOf(now):selected+'-01';
    const quick=`<form id="expense-form"><div class="money-fields">${number('Amount · R','', 'name="amount" required min="0.01"')}<label>Category<select name="category">${options}</select></label></div><div class="money-fields"><label>Date<input name="date" type="date" value="${date}" required></label><label>Note (optional)<input name="note" maxlength="200" placeholder="What was it for?"></label></div><button class="money-primary" type="submit">+ Add expense</button></form><p class="money-hint">The date chooses the month. Log entries add to “Other actual”; leave it blank if you log everything.</p><ul class="money-list expense-log">${log || '<li class="money-hint">No expenses logged this month.</li>'}</ul>`;
    const forecast=selected===monthOf(now) ? `<div class="money-metrics">${metric('Days left',a.remaining,'After today')}${metric('Daily allowance',a.allowance==null?'—':fmt(a.allowance),'Leftover ÷ days left')}${metric('Month-end outflow',a.forecast==null?'Add actuals':fmt(a.forecast),'Spent-to-date ÷ days elapsed × days in month')}${metric('Forecast leftover',a.forecast==null?'—':fmt(m.income-a.forecast),'Pace estimate, including savings transfers')}</div><p class="money-hint">Pace assumes spending is spread evenly. Rent and other once-off payments can skew it. Allowance reserves plans for categories without actuals.</p>` : '<p class="money-hint">Live pace and daily allowance appear on the current month.</p>';
    const goal=s.car.goal, track=goal ? (a.projection>=goal?'On track':'Behind by '+fmt(goal-a.projection)) : 'Set a goal to see whether you are on track.';
    const projection=`<div class="money-metrics">${metric('Average outflow',a.avgSpend==null?'—':fmt(a.avgSpend))}${metric('Average leftover',a.avgLeft==null?'—':fmt(a.avgLeft))}</div><p class="money-hint">${a.recorded} month(s) with actuals through ${title(selected<monthOf(now)?selected:monthOf(now))}. Partial months included; categories without actuals use their plan.</p><h4>Car pot · June 2027</h4><div class="money-fields">${number('Goal · R',s.car.goal,'data-car="goal"')}${number('Opening balance · R',s.car.opening,'data-car="opening"')}</div><p class="money-callout">${fmt(a.balance)} recorded balance → <b>${fmt(a.projection)}</b> projected<br>${track}</p><p class="money-hint">${a.avgCar==null?'Add actual car-pot contributions to establish an average.':fmt(a.avgCar)+' average put aside per recorded month.'} Projection adds ${a.monthsLeft} monthly contributions through Jun 2027. Opening balance excludes contributions logged here.</p>`;
    const pots=Object.entries(s.pots).map(([id,p])=>{
      const pct=p.target?Math.min(100,p.current/p.target*100):0;
      return `<div class="pot" data-pot="${esc(id)}"><svg viewBox="0 0 48 48" role="img" aria-label="${Math.round(pct)} percent saved"><circle cx="24" cy="24" r="19" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="24" cy="24" r="19" fill="none" stroke="var(--home)" stroke-width="5" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 24 24)"/><text x="24" y="28" text-anchor="middle">${Math.round(pct)}%</text></svg><div><b>${esc(p.name)}</b><div class="money-fields">${number('Current · R',p.current,'data-pot-field="current"')}${number('Target · R',p.target,'data-pot-field="target"')}</div></div><button type="button" data-remove-pot="${esc(id)}" aria-label="Delete ${esc(p.name)} pot">×</button></div>`;
    }).join('');
    const potForm=`<p class="money-hint">Track other balances here. Updating a pot does not add an expense; log the transfer separately. The car pot is above.</p>${pots}<form id="pot-form"><label>Pot name<input name="name" required maxlength="60" placeholder="e.g. Emergency fund"></label><div class="money-fields">${number('Target · R','','name="target" required')}${number('Current · R',0,'name="current" required')}</div><button type="submit">+ Add pot</button></form>`;
    const subscriptions=Object.entries(s.subscriptions).map(([id,p])=>`<li><div><b>${esc(p.name)}</b><small>${fmt(p.amount)} / month</small></div><button type="button" data-remove-sub="${esc(id)}" aria-label="Delete ${esc(p.name)} recurring item">×</button></li>`).join('');
    const subForm=`<p class="money-callout"><b>${fmt(Object.values(s.subscriptions).reduce((n,p)=>n+p.amount,0))}</b> monthly</p><p class="money-hint">A reminder list. Add these to a category’s plan and log payments there; this list does not count them twice.</p><ul class="money-list">${subscriptions || '<li class="money-hint">No subscriptions added.</li>'}</ul><form id="sub-form"><label>Name<input name="name" required maxlength="60" placeholder="e.g. Fibre"></label>${number('Monthly amount · R','','name="amount" required min="0.01"')}<button type="submit">+ Add recurring item</button></form>`;
    const loan=`<h4>FNB personal loan</h4><p class="money-callout"><b>${Number(a.paid.toFixed(2))} of 12</b> payment equivalents recorded<br><b>${fmt((12-a.paid)*5000)}</b> instalments remaining</p><div class="money-track"><span style="width:${a.paid/12*100}%"></span></div><p class="money-hint">R5,000 × 12 = R60,000 scheduled repayments. This is remaining instalments, not a bank settlement quote. Counts actuals through the selected month (up to today), plus confirmed earlier payments.</p><div class="money-fields"><label>First payment<select id="loan-start"><option value="2026-10" ${s.loan.start==='2026-10'?'selected':''}>Oct 2026</option><option value="2026-11" ${s.loan.start==='2026-11'?'selected':''}>Nov 2026</option></select></label>${number('Earlier payments (not logged)',s.loan.openingPayments,'id="loan-opening" max="12" step="1"')}</div><p class="money-hint">Scheduled payoff: <b>${title(shift(s.loan.start,11))}</b>. Approved in October; confirm the first debit month. Changing it updates the schedule and stops future carry-over after payment 12.</p>`;
    root.innerHTML=`<div class="sec"><h2>💸 Money in motion</h2><p>Make a plan. Log the real numbers. See what changes.</p></div><div class="panel pacer money-hero"><div class="month-switch"><button type="button" data-month="-1" aria-label="Previous month">‹</button><h3 aria-live="polite">${title(selected)}</h3><button type="button" data-month="1" aria-label="Next month">›</button></div>${!started?'<p class="money-hint">Plan preview. Recurring amounts and income carry from the latest earlier month; actuals start blank.</p><button type="button" id="start-month">Save this month</button>':''}<div class="money-fields">${number('Monthly income · R',m.income,'id="money-income"')}<div class="money-left ${t.left<0?'money-over':''}"><small>Left after actuals / plan</small><strong aria-live="polite">${fmt(t.left)}</strong></div></div><div class="money-metrics">${metric('Planned',fmt(t.plan))}${metric('Actual outflow',fmt(t.actual),t.known?'Recorded so far':'No actuals yet')}</div><p class="money-hint">Leftover uses each category’s actual when entered, otherwise its enabled plan. Zero counts as an actual. Outflow includes money put aside.</p></div>${section('quick','＋ Quick expense',quick,Object.keys(m.log).length+' logged')}${section('budget','Plan & actual',`<p class="money-hint">Untick to pause a plan. Repeat carries it to new months. “Other actual” is spending outside the log; clear it to return to plan. Existing saved amounts and toggles were kept in Nov 2026.</p>${budget}<form id="category-form"><label>New category<input name="name" maxlength="60" required placeholder="e.g. Transport"></label><button type="submit">+ Add category</button></form><div class="notewrap"><button class="notetoggle" type="button">💬 Money notes</button><textarea class="notebox" data-note-key="pacer-notes" placeholder="A note for the two of you"></textarea></div>`)}${section('pace','This month’s pace',forecast)}${section('trends','Month to month',charts(s)+movers(s,m))}${section('outlook','Averages & car outlook',projection)}${section('pots','Savings pots',potForm,Object.keys(s.pots).length+' pots')}${section('recurring','Subscriptions & recurring',subForm)}${section('loan','Debt & loan',loan)}`;
    for(const [id,fields] of drafts) {
      const form=document.getElementById(id);
      if(form) for(const [name,value] of fields) if(form.elements.namedItem(name)) form.elements.namedItem(name).value=value;
    }
    root.inert=!NEST._ready && !NEST._get(KEY,null) && !NEST._get('nest_pacer',null);
    if(root.inert) root.insertAdjacentHTML('afterbegin','<p class="money-callout" role="status">Connecting to your shared budget. Saved values will appear after sync; reconnect if you are offline.</p>');
    NEST.wire(root); NEST._repaint();
  }
  root.addEventListener('change',e=>{
    const el=e.target;
    if(el.closest('form')) return;
    if(el.id==='money-income') change(s=>{month(s).income=cash(el.value);});
    else if(el.dataset.field) change(s=>{
      const k=el.closest('[data-category]').dataset.category, m=month(s);
      const r=m.rows[k] ||= {plan:0,on:true,recurring:true,actual:null};
      r[el.dataset.field]=el.type==='checkbox'?el.checked:el.dataset.field==='actual'&&el.value===''?null:cash(el.value);
    });
    else if(el.dataset.car) change(s=>{s.car[el.dataset.car]=cash(el.value);});
    else if(el.dataset.potField) change(s=>{s.pots[el.closest('[data-pot]').dataset.pot][el.dataset.potField]=cash(el.value);});
    else if(el.id==='loan-opening') change(s=>{s.loan.openingPayments=Math.min(12,Math.floor(cash(el.value)));});
    else if(el.id==='loan-start') change(s=>{
      const previous=s.loan.start; s.loan.start=el.value;
      for(const [key,m] of Object.entries(s.months)) {
        const r=m.rows.fnb_loan;
        if(r && (distance(previous,key)<0 || distance(previous,key)>=12 || !loanDue(s,key))) r.on=loanDue(s,key);
      }
    });
  });
  // Keep a blur-triggered save from replacing the button under a finger.
  root.addEventListener('pointerdown',()=>{pointerDown=true;});
  root.addEventListener('pointercancel',()=>{pointerDown=false;if(pendingRender)render();});
  root.addEventListener('click',e=>{
    pointerDown=false;
    if(pendingRender) setTimeout(()=>render(),0);
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.month) {selected=shift(selected,+b.dataset.month);render();}
    else if(b.id==='start-month') change(s=>{month(s);});
    else if(b.dataset.deleteLog && confirm('Delete this expense? Its amount will be removed from actuals.')) change(s=>{delete month(s).log[b.dataset.deleteLog];});
    else if(b.dataset.removePot && confirm('Delete this savings pot?')) change(s=>{delete s.pots[b.dataset.removePot];});
    else if(b.dataset.removeSub && confirm('Delete this recurring item?')) change(s=>{delete s.subscriptions[b.dataset.removeSub];});
  });
  root.addEventListener('submit',e=>{
    const f=e.target; if(!['expense-form','category-form','pot-form','sub-form'].includes(f.id)) return;
    e.preventDefault(); document.activeElement?.blur();
    const data=new FormData(f), id=crypto.randomUUID(), name=String(data.get('name') || '').trim();
    if(f.id==='expense-form') {
      const date=String(data.get('date')), amount=cash(data.get('amount'));
      if(!amount || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const target=date.slice(0,7);
      f.dataset.clearDraft='true';
      change(s=>{
        const m=s.months[target] ||= preview(s,target);
        m.log[id]={amount,category:data.get('category'),note:String(data.get('note')).trim(),date};
        selected=target;
      });
    } else if(name) { f.dataset.clearDraft='true'; change(s=>{
      if(f.id==='category-form') {s.categories[id]={name};month(s).rows[id]={plan:0,actual:null,on:true,recurring:true};}
      else if(f.id==='pot-form') s.pots[id]={name,target:cash(data.get('target')),current:cash(data.get('current'))};
      else s.subscriptions[id]={name,amount:cash(data.get('amount'))};
    }); }
  });
  root.addEventListener('focusout',()=>setTimeout(()=>{if(pendingRender)render();},0));
  window.addEventListener('nest:sync',()=>{
    // Do not seed a blank phone before the shared legacy pacer has arrived.
    if(NEST._ready && !NEST._get(KEY,null)) NEST._set(KEY,migrate(NEST._get('nest_pacer',{})));
    render();
  });
  render();
})();
