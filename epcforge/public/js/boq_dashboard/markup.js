// Static skeleton of the BOQ dashboard. Every dynamic node carries a data-field (text)
// or data-slot (rendered visual); dashboard.js fills them from the API response.
frappe.provide("epcforge.boq_dashboard");

epcforge.boq_dashboard.HTML = `
<div class="cd">
<div class="bar">
  <span class="k">${__("Bill of Quantities")}</span>
  <span class="asof" data-field="asof">—</span>
  <span class="asof" data-field="ccy_note">—</span>
</div>

<div class="hd">
  <div class="hd-mono">BOQ</div>
  <div class="hd-id">
    <div class="hd-name" data-field="title">—</div>
    <div class="hd-meta" data-field="meta">—</div>
  </div>
  <div class="hd-r">
    <div><div class="k">${__("Contract value")}</div><div class="v" data-field="hd_contract">—</div></div>
    <div><div class="k">${__("Gross margin")}</div><div class="v" data-field="hd_margin">—</div></div>
  </div>
</div>

<div class="mx surf">
  <div class="mx-c">
    <div class="k">${__("Contract value")}</div>
    <div class="mx-v" data-field="contract">—</div>
    <div class="mx-s"><span class="pill" data-field="contract_pill">—</span><span data-field="contract_caption">—</span></div>
    <div class="mx-sp" data-slot="contract_split"></div>
  </div>
  <div class="mx-c">
    <div class="k">${__("Estimated cost")}</div>
    <div class="mx-v" data-field="estimated">—</div>
    <div class="mx-s"><span class="pill" data-field="margin_pill">—</span><span>${__("planned margin")}</span></div>
    <div class="mx-sp" data-slot="estimated_gauge"></div>
  </div>
  <div class="mx-c tint">
    <div class="k">${__("Actual cost to date")}</div>
    <div class="mx-v" data-field="actual">—</div>
    <div class="mx-s"><span class="pill" data-field="burn_pill">—</span><span>${__("of estimate")}</span></div>
    <div class="mx-sp" data-slot="actual_gauge"></div>
  </div>
  <div class="mx-c">
    <div class="k">${__("Billed to client")}</div>
    <div class="mx-v" data-field="billed">—</div>
    <div class="mx-s"><span class="pill" data-field="billed_pill">—</span><span data-field="billed_caption">—</span></div>
    <div class="mx-sp" data-slot="billed_gauge"></div>
  </div>
</div>

<div class="sec">${__("Procurement · stock material lines")}</div>
<div class="fl">
  <div class="fl-c" style="--bg:#22405e"><div class="fl-k">${__("BOQ value")}</div>
    <div class="fl-v" data-field="st_value">—</div><div class="fl-s" data-field="st_value_s">—</div></div>
  <div class="fl-c" style="--bg:#17505d"><div class="fl-k">${__("Requested")}</div>
    <div class="fl-v"><a class="lk" data-field="st_mr" data-drill="mr">—</a></div><div class="fl-s" data-field="st_mr_s">—</div></div>
  <div class="fl-c" style="--bg:#0f5a4e"><div class="fl-k">${__("Ordered")}</div>
    <div class="fl-v"><a class="lk" data-field="st_po" data-drill="po">—</a></div><div class="fl-s" data-field="st_po_s">—</div></div>
  <div class="fl-c" style="--bg:#7a4f12"><div class="fl-k">${__("Received")}</div>
    <div class="fl-v"><a class="lk" data-field="st_pr" data-drill="pr">—</a></div><div class="fl-s" data-field="st_pr_s">—</div></div>
</div>

<div class="surf card">
  <div class="two">
    <div>
      <div class="hrow"><div class="h">${__("Cost by item type")}</div><div class="hs" data-field="type_caption">—</div></div>
      <div data-slot="type_chart"></div>
      <div class="lgd"><span><i style="background:#097C52"></i>${__("Contract value")}</span><span><i style="background:#a3552f;height:2px"></i>${__("Estimated cost")}</span></div>
    </div>
    <div>
      <div class="hrow"><div class="h">${__("Margin by item type")}</div><div class="hs">${__("Planned · contract − estimate")}</div></div>
      <table class="terms"><tbody data-slot="type_rows"></tbody></table>
    </div>
  </div>
</div>

<div class="surf card">
  <div class="two">
    <div>
      <div class="hrow"><div class="h">${__("Billing schedule")}</div><div class="hs" data-field="schedule_caption">—</div></div>
      <div data-slot="timeline"></div>
      <div class="lgd">
        <span><i style="background:#17626e;opacity:.55"></i>${__("Time elapsed")}</span>
        <span><i style="background:#2f5a86;border-radius:50%"></i>${__("Pending")}</span>
        <span><i style="background:#8a5a16;border-radius:50%"></i>${__("Invoiced")}</span>
        <span><i style="background:#097C52;border-radius:50%"></i>${__("Received")}</span>
      </div>
    </div>
    <div>
      <div class="hrow"><div class="h">${__("Milestone status")}</div><div class="hs">${__("Gross milestone amount")}</div></div>
      <div data-slot="milestone_split"></div>
    </div>
  </div>
</div>

<div class="surf card">
  <div class="hrow"><div class="h">${__("Procurement by line")}</div><div class="hs">${__("Requested · ordered · received, in each line's own unit")}</div></div>
  <div class="rk" data-slot="lines"></div>
</div>

<div class="surf card">
  <div class="hrow"><div class="h">${__("Payment milestones")}</div><div class="hs" data-field="ms_caption">—</div></div>
  <div class="tb-wrap">
    <table class="tb">
      <thead><tr>
        <th>${__("Milestone")}</th><th>${__("Target")}</th><th>${__("Status")}</th><th>${__("Invoice")}</th>
        <th class="n">${__("Share")}</th><th class="n">${__("Amount")}</th><th class="n">${__("Net payable")}</th>
      </tr></thead>
      <tbody data-slot="milestones"></tbody>
    </table>
  </div>
</div>
</div>
`;
