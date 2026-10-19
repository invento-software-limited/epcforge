// Stylesheet for the BOQ dashboard tab. It is mounted inside a shadow root,
// so these rules never reach the rest of Desk and Desk/other apps never restyle them.
frappe.provide("epcforge.boq_dashboard");

epcforge.boq_dashboard.CSS = `
:host{display:block;
  --ink:#0d1117;--mid:#5c6672;--soft:#98a1ac;--rule:#e3e7ec;--rule-2:#f0f3f6;--r:8px;
  --green-d:#0a5a3c;--green:#097C52;--teal-d:#17505d;--teal:#17626e;--steel-d:#22405e;--steel:#2f5a86;
  --amber-d:#7a4f12;--amber:#8a5a16;--rust-d:#8a4527;--rust:#a3552f;--claret-d:#7e2a30;--claret:#a3302f;
  --slate-d:#3b4757;--slate:#5c6672}
*,*::before,*::after{box-sizing:border-box}
.cd{font-family:var(--font-stack,"InterVariable","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);
  color:var(--ink);font-feature-settings:"tnum" 1;padding:4px 2px 26px;font-size:12px;line-height:1.4}
.k,.sec,.tb th,.fl-k{font-size:9px;letter-spacing:.16em;text-transform:uppercase;font-weight:500}
.k,.sec,.tb th{color:#000}
.surf{background:#fff;border:1px solid var(--rule);border-radius:var(--r)}
a.lk{color:inherit;text-decoration:none;cursor:pointer}
a.lk:hover{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
a.lk:focus-visible{outline:2px solid var(--steel);outline-offset:2px;border-radius:2px}

/* 0 · as-of bar */
.bar{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;margin:0 0 12px}
.asof{font-size:10.5px;color:var(--mid)}
.bar .asof:last-child{margin-left:auto}

/* 1 · header */
.hd{position:relative;overflow:hidden;border-radius:var(--r);padding:20px 22px;border:1px solid #c6d8cd;
  background:linear-gradient(105deg,#d6e9de 0%,#d3e2ee 50%,#ded6ec 100%);display:flex;align-items:center;gap:18px}
.hd::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(180deg,#065c3d,#234973)}
.hd-mono{width:46px;height:46px;flex:none;border-radius:6px;background:#065c3d;border:1px solid rgba(255,255,255,.28);
  color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600}
.hd-id{flex:1;min-width:0}
.hd-name{font-size:23px;font-weight:600;letter-spacing:-.5px;line-height:1.1;overflow-wrap:anywhere}
.hd-meta{font-size:11.5px;color:#4d5b54;margin-top:6px}
.hd-meta b{font-weight:500;color:var(--ink)}
.hd-r{flex:none;display:flex;gap:28px;text-align:right}
.hd-r .v{font-size:20px;font-weight:600;letter-spacing:-.5px;line-height:1.15;margin-top:5px;white-space:nowrap}

/* 2 · metric row */
.mx{overflow:hidden;display:grid;grid-template-columns:repeat(4,1fr);margin-top:14px}
.mx-c{padding:16px 17px 14px;border-left:1px solid var(--rule-2);display:flex;flex-direction:column;min-width:0}
.mx-c:first-child{border-left:0}
.mx-c.tint{background:#f8fafc}
.mx-v{font-size:26px;font-weight:600;letter-spacing:-1.1px;line-height:1.05;margin-top:9px;white-space:nowrap}
.mx-v span:not([data-field]){font-size:12.5px;font-weight:500;color:var(--soft);margin-left:2px;letter-spacing:-.2px}
.mx-s{font-size:11.5px;color:#000;margin-top:8px;display:flex;align-items:center;gap:7px;white-space:nowrap;
  min-height:20px;overflow:hidden;text-overflow:ellipsis}
.mx-sp{margin-top:auto;padding-top:15px;line-height:0}
.pill{display:inline-block;font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:5px;color:#fff;
  letter-spacing:.02em;white-space:nowrap;line-height:1.3;background:var(--slate-d)}

/* gauge + segmented bar mini-visuals */
.pg{line-height:1}
.pg-t{position:relative;height:6px;border-radius:3px;background:#eef1f4}
.pg-f{height:100%;border-radius:3px;max-width:100%}
.pg-m{position:absolute;top:-3px;width:2px;height:12px;background:var(--ink)}
.pg-l{display:flex;justify-content:space-between;font-size:9px;color:var(--soft);margin-top:5px;white-space:nowrap}
.sg-b{display:flex;height:8px;border-radius:4px;overflow:hidden;background:#eef1f4}
.sg-b i{display:block;height:100%}
.sg-l{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:9.5px;color:var(--mid);margin-top:6px;line-height:1.2}
.sg-l span{display:flex;align-items:center;gap:4px;white-space:nowrap}
.sg-l i{width:7px;height:7px;display:inline-block;border-radius:2px}

/* 3 · lifecycle strip */
.sec{margin:30px 0 14px;display:flex;align-items:center;gap:14px}
.sec::after{content:"";flex:1;height:1px;background:var(--rule)}
.fl{display:grid;grid-template-columns:repeat(4,1fr);gap:2px}
.fl-c{padding:15px 15px 14px;background:var(--bg);color:#fff;min-width:0}
.fl-c:first-child{border-radius:var(--r) 0 0 var(--r)}
.fl-c:last-child{border-radius:0 var(--r) var(--r) 0}
.fl-k{color:rgba(255,255,255,.74)}
.fl-v{font-size:21px;font-weight:600;letter-spacing:-.8px;margin-top:9px;white-space:nowrap}
.fl-s{font-size:10.5px;color:rgba(255,255,255,.76);margin-top:5px;white-space:nowrap}
.fl-c a.lk:hover{text-decoration-color:rgba(255,255,255,.65)}

/* 4 · cards */
.card{padding:17px 19px 16px;margin-top:25px}
.two{display:grid;grid-template-columns:1.3fr 1fr;gap:34px;align-items:start}
.two > div{min-width:0}
.hrow{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:15px}
.h{font-size:12.5px;font-weight:600;letter-spacing:-.1px;flex:none}
.hs{font-size:10.5px;color:#000;text-align:right;flex:1;min-width:0}
svg{display:block;width:100%;max-width:100%}
.lgd{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 16px;font-size:10.5px;color:var(--mid);margin-top:8px}
.lgd i{width:9px;height:9px;display:inline-block;margin-right:6px;vertical-align:-1px;border-radius:1px}
.terms{width:100%;border-collapse:collapse;font-size:12px}
.terms td{padding:8px 0;border-bottom:1px solid var(--rule-2);color:var(--mid);vertical-align:top}
.terms td:first-child{white-space:nowrap}
.terms tr:last-child td{border-bottom:0}
.terms td.n{text-align:right;color:var(--ink);font-weight:500;padding-left:12px}

/* 5 · goods */
.rk{display:flex;flex-direction:column;gap:13px}
.rk-r{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.rk-d{width:7px;height:7px;border-radius:2px;flex:none}
.rk-n{font-size:12.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-v{font-size:12px;font-weight:600;white-space:nowrap}
.rk-v em{font-style:normal;font-weight:400;color:var(--mid)}
.rk-t{height:5px;border-radius:3px;background:#eff2f6;overflow:hidden}
.rk-f{height:100%;border-radius:3px;max-width:100%}

/* 6 · documents */
.tb-wrap{overflow-x:auto}
.tb{width:100%;border-collapse:collapse;font-size:12px}
.tb th{text-align:left;padding:0 12px 10px 0;border-bottom:1px solid var(--rule);white-space:nowrap}
.tb th.n,.tb td.n{text-align:right;padding-right:0}
.tb td{padding:11px 12px 11px 0;border-bottom:2px solid var(--rule-2);color:var(--mid);white-space:nowrap}
.tb tr:last-child td{border-bottom:0}
.tb td.n{color:var(--ink);font-weight:500}
.tb th.n + th.n,.tb td.n + td.n{padding-left:18px}
.tb td.doc a{color:#234973;font-weight:500}
/* shipments + landed cost */
.sh{display:flex;flex-direction:column;gap:12px}
.sh-r{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding-bottom:12px;border-bottom:1px solid var(--rule-2)}
.sh-r:last-child{border-bottom:0;padding-bottom:0}
.sh-n{font-weight:600;color:#234973;cursor:pointer}
.sh-n:hover{text-decoration:underline;text-underline-offset:2px}
.sh-m{grid-column:1/-1;font-size:11px;color:var(--mid);display:flex;flex-wrap:wrap;gap:2px 12px}
.sh-m b{font-weight:500;color:var(--ink)}
.sh-steps{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:3px}
.sh-steps span{height:4px;border-radius:2px;background:#eef1f4}
.sh-steps span.on{background:var(--teal)}
.sh-steps span.late{background:var(--claret)}
.lcost .sg-b{height:10px;border-radius:5px}
.lcost table{margin-top:12px}
.lcost td i{width:8px;height:8px;display:inline-block;border-radius:2px;margin-right:8px;vertical-align:0}
.lcost tr.tot td{color:var(--ink);font-weight:600;border-top:1px solid var(--rule)}
.empty{padding:22px 0 8px;text-align:center;color:var(--soft);font-size:11.5px}
.err{padding:28px 0;text-align:center;color:var(--claret);font-size:12px}

@media (max-width:960px){.fl{grid-template-columns:repeat(2,1fr)}.fl-c:first-child,.fl-c:last-child{border-radius:0}}
@media (max-width:860px){
  .mx{grid-template-columns:repeat(2,1fr)}
  .mx-c:nth-child(3){border-left:0}
  .mx-c:nth-child(n+3){border-top:1px solid var(--rule-2)}
  .two{grid-template-columns:1fr;gap:24px}
}
@media (max-width:600px){
  .hd{flex-wrap:wrap}
  .hd-r{width:100%;justify-content:flex-start;text-align:left}
  .fl{grid-template-columns:1fr}
  .fl-c,.fl-c:first-child,.fl-c:last-child{border-radius:0}
  .fl-c:first-child{border-radius:var(--r) var(--r) 0 0}
  .fl-c:last-child{border-radius:0 0 var(--r) var(--r)}
}
`;
