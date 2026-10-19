// Static skeleton of the Project Budget dashboard. data-field = text, data-slot = rendered visual.
frappe.provide("epcforge.budget_dashboard");

epcforge.budget_dashboard.HTML = `
<div class="cd">
<div class="bar">
  <span class="k">${__("Project budget")}</span>
  <span class="asof" data-field="asof">—</span>
  <span class="asof" data-field="ccy_note">—</span>
</div>

<div class="hd">
  <div class="hd-mono">BUD</div>
  <div class="hd-id">
    <div class="hd-name" data-field="title">—</div>
    <div class="hd-meta" data-field="meta">—</div>
  </div>
  <div class="hd-r">
    <div><div class="k">${__("Approved budget")}</div><div class="v" data-field="hd_budget">—</div></div>
    <div><div class="k">${__("Budget health")}</div><div class="v" data-field="hd_health">—</div></div>
  </div>
</div>

<div class="mx surf">
  <div class="mx-c">
    <div class="k">${__("Approved budget")}</div>
    <div class="mx-v" data-field="budget">—</div>
    <div class="mx-s"><span class="pill" data-field="budget_pill">—</span><span data-field="budget_caption">—</span></div>
    <div class="mx-sp" data-slot="budget_split"></div>
  </div>
  <div class="mx-c">
    <div class="k">${__("Committed")}</div>
    <div class="mx-v" data-field="committed">—</div>
    <div class="mx-s"><span class="pill" data-field="committed_pill">—</span><span>${__("of budget")}</span></div>
    <div class="mx-sp" data-slot="committed_gauge"></div>
  </div>
  <div class="mx-c">
    <div class="k">${__("Actual cost")}</div>
    <div class="mx-v" data-field="actual">—</div>
    <div class="mx-s"><span class="pill" data-field="actual_pill">—</span><span>${__("of budget")}</span></div>
    <div class="mx-sp" data-slot="actual_gauge"></div>
  </div>
  <div class="mx-c tint">
    <div class="k">${__("Remaining budget")}</div>
    <div class="mx-v" data-field="remaining">—</div>
    <div class="mx-s"><span class="pill" data-field="remaining_pill">—</span><span>${__("free to commit")}</span></div>
    <div class="mx-sp" data-slot="remaining_split"></div>
  </div>
</div>

<div class="sec">${__("Earned value")}<span style="margin-left:auto;order:2;letter-spacing:0;text-transform:none;font-size:10.5px;font-weight:400" data-field="evm_sub">—</span></div>
<div class="fl">
  <div class="fl-c" style="--bg:#22405e"><div class="fl-k">${__("Planned value")}</div><div class="fl-v" data-field="pv">—</div><div class="fl-s" data-field="pv_s">—</div></div>
  <div class="fl-c" style="--bg:#17505d"><div class="fl-k">${__("Earned value")}</div><div class="fl-v" data-field="ev">—</div><div class="fl-s" data-field="ev_s">—</div></div>
  <div class="fl-c" style="--bg:#0f5a4e"><div class="fl-k">${__("Actual cost")}</div><div class="fl-v" data-field="ac">—</div><div class="fl-s" data-field="ac_s">—</div></div>
  <div class="fl-c" style="--bg:#7a4f12"><div class="fl-k">${__("Estimate at completion")}</div><div class="fl-v" data-field="eac">—</div><div class="fl-s" data-field="eac_s">—</div></div>
</div>

<div class="surf card">
  <div class="two">
    <div>
      <div class="hrow"><div class="h">${__("Budget vs used by cost head")}</div><div class="hs" data-field="heads_caption">—</div></div>
      <div data-slot="heads_chart"></div>
      <div class="lgd"><span><i style="background:#097C52"></i>${__("Budget")}</span><span><i style="background:#a3552f;height:2px"></i>${__("Committed + actual")}</span></div>
    </div>
    <div>
      <div class="hrow"><div class="h">${__("Performance")}</div><div class="hs" data-field="perf_caption">—</div></div>
      <table class="terms"><tbody data-slot="performance"></tbody></table>
    </div>
  </div>
</div>

<div class="surf card">
  <div class="hrow"><div class="h">${__("Budget lines")}</div><div class="hs" data-field="lines_caption">—</div></div>
  <div class="tb-wrap">
    <table class="tb">
      <thead><tr>
        <th>${__("Cost head")}</th><th>${__("Status")}</th><th class="n">${__("Budget")}</th><th class="n">${__("Committed")}</th>
        <th class="n">${__("Actual")}</th><th class="n">${__("Remaining")}</th><th class="n">${__("Used")}</th>
      </tr></thead>
      <tbody data-slot="lines"></tbody>
    </table>
  </div>
</div>
</div>
`;
