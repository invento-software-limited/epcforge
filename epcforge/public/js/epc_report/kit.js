// Header kit for the EPCForge Script Reports: KPI cards with mini-visuals and charts above the
// datatable, in the BOQ dashboard's design. It renders into a shadow root, so no other app's
// CSS reaches it and its own never leaks into Desk. Clicks are bound in JS (data-act), not
// inline onclick, so the report's isolated script scope does not matter.
frappe.provide("epcforge");

epcforge.report_kit = (() => {
	const fmt = epcforge.boq_dashboard.format;
	const mini = { ...epcforge.boq_dashboard.charts, ...epcforge.boq_dashboard.page_charts };
	const esc = (v) => fmt.esc(v);

	const CSS = `
.rh{padding:4px 0 6px}
.mx.c5{grid-template-columns:repeat(5,1fr)}
.mx{margin-top:0}
.mx-c[data-act]{cursor:pointer}
.mx-c[data-act]:hover{background:#f7f9fb}
.mx-c.tint[data-act]:hover{background:#f1f5f9}
.card{margin-top:14px}
.chips{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:10.5px;color:var(--mid)}
.chips span{display:inline-flex;align-items:center;gap:6px}
.chips b{font-weight:600;color:#fff;border-radius:4px;padding:1px 6px;font-size:10px}
.sg-rows{display:flex;flex-direction:column;gap:8px;margin-top:12px;font-size:12px}
.sg-row{display:grid;grid-template-columns:9px 1fr auto auto;gap:8px;align-items:center}
.sg-row i{width:8px;height:8px;border-radius:2px}
.sg-row .p{color:var(--mid);font-size:11px}
.sg-row .v{font-weight:600;white-space:nowrap;text-align:right}
[data-act].sg-row,.rk > [data-act]{cursor:pointer}
[data-act].sg-row:hover .n,.rk > [data-act]:hover .rk-n{text-decoration:underline;text-underline-offset:3px}
svg [data-act]{cursor:pointer}
svg [data-act]:hover{opacity:.8}
.note{font-size:11px;color:var(--mid);margin-top:8px}
.empty{padding:16px 0 6px}
@media (max-width:1100px){.mx.c5{grid-template-columns:repeat(3,1fr)}.mx.c5 .mx-c:nth-child(4){border-left:0}.mx.c5 .mx-c:nth-child(n+4){border-top:1px solid var(--rule-2)}}
@media (max-width:860px){.mx.c5{grid-template-columns:repeat(2,1fr)}.mx.c5 .mx-c{border-left:1px solid var(--rule-2)}.mx.c5 .mx-c:nth-child(odd){border-left:0}.mx.c5 .mx-c:nth-child(n+3){border-top:1px solid var(--rule-2)}}
`;

	// "৳ 3.4<span>L</span>" — the big number with its unit in a lighter span.
	function money(n) {
		const el = document.createElement("div");
		fmt.set_compact(el, n || 0);
		return el.innerHTML;
	}

	const count = (n, unit) => `${esc(fmt.qty(n || 0))}${unit ? `<span>${esc(unit)}</span>` : ""}`;
	const act_attrs = (act, arg) => (act ? ` data-act="${esc(act)}" data-arg="${esc(arg == null ? "" : JSON.stringify(arg))}"` : "");

	// One KPI card; `act`/`arg` make the whole figure a drill-through to one origin.
	function card({ k, v, pill, sub, visual, tint, act, arg, title }) {
		const chip = pill ? `<span class="pill" style="background:${pill[1]}">${esc(pill[0])}</span>` : "";
		return `<div class="mx-c${tint ? " tint" : ""}"${act_attrs(act, arg)}${title ? ` title="${esc(title)}"` : ""}>
			<div class="k">${esc(k)}</div><div class="mx-v">${v}</div>
			<div class="mx-s">${chip}<span>${esc(sub || "")}</span></div><div class="mx-sp">${visual || ""}</div></div>`;
	}

	// A step from (1, 2, 2.5, 5, 10) × 10^n so at most ~5 gridlines appear.
	function nice(max) {
		const raw = max / 4 || 1;
		const mag = Math.pow(10, Math.floor(Math.log10(raw)));
		const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((s) => raw <= s) || mag * 10;
		return { step, top: Math.ceil(max / step) * step || step };
	}

	// Axis scale named in the chart subtitle (lakh / thousand / million).
	function scale(max) {
		const south = ["BDT", "INR", "PKR", "NPR", "LKR"].includes(fmt.ccy.code);
		if (south) return max >= 1e7 ? [1e7, __("crore")] : max >= 1e5 ? [1e5, __("lakh")] : [1e3, __("thousand")];
		return max >= 1e6 ? [1e6, __("million")] : [1e3, __("thousand")];
	}

	// Bars per period or category, optional comparison line. Each bar drills with its own
	// argument: series.args[i] when given, otherwise its period (series.starts/ends).
	function bars({ series, line, color = "#097C52", line_color = "#a3552f", act, counts, W = 520, names = [] }) {
		const H = 190, ML = 40, MR = 8, MT = 12, MB = 24;
		const labels = series.labels || [], vals = series.values || [], cmp = line ? line.values : [];
		if (!labels.length) return { svg: `<div class="empty">${__("No data for this period.")}</div>`, unit: "" };
		const max = Math.max(...vals, ...cmp, 0);
		const [div, unit] = counts ? [1, ""] : scale(max);
		const { step, top } = nice((max || (counts ? 1 : div)) / div);
		const y = (v) => MT + (1 - v / div / top) * (H - MT - MB);
		const col = (W - ML - MR) / labels.length, bw = Math.max(5, Math.min(34, col * 0.55));
		let svg = "";
		for (let v = 0; v <= top + 1e-9; v += step) {
			const yy = (MT + (1 - v / top) * (H - MT - MB)).toFixed(1);
			svg += `<line x1="${ML}" x2="${W - MR}" y1="${yy}" y2="${yy}" stroke="#edf0f3"/><text x="${ML - 8}" y="${(+yy + 3.5).toFixed(1)}" font-size="9.5" fill="#98a1ac" text-anchor="end">${+v.toFixed(2)}</text>`;
		}
		const pts = [];
		labels.forEach((label, i) => {
			const cx = ML + (i + 0.5) * col, h = y(0) - y(vals[i] || 0);
			const tip = `${label}: ${counts ? fmt.qty(vals[i]) : fmt.compact(vals[i])}${line ? ` · ${names[1] || ""} ${fmt.compact(cmp[i])}` : ""}`;
			const arg = series.args ? series.args[i] : series.starts ? { from_date: series.starts[i], to_date: series.ends[i] } : null;
			svg += `<g${act && arg != null ? act_attrs(act, arg) : ""}><title>${esc(tip)}</title>
				<rect x="${(cx - col / 2).toFixed(1)}" y="${MT}" width="${col.toFixed(1)}" height="${H - MT - MB}" fill="transparent"/>
				<rect x="${(cx - bw / 2).toFixed(1)}" y="${(y(0) - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" fill="${color}" rx="1.5"/></g>`;
			if (line) pts.push(`${cx.toFixed(1)} ${y(cmp[i] || 0).toFixed(1)}`);
			if (labels.length <= 14 || i % 2 === 0) svg += `<text x="${cx.toFixed(1)}" y="${H - 7}" font-size="9.5" fill="#98a1ac" text-anchor="middle">${esc(String(label).length > 13 ? String(label).slice(0, 12) + "…" : label)}</text>`;
		});
		if (line) {
			svg += `<path d="M ${pts.join(" L ")}" fill="none" stroke="${line_color}" stroke-width="1.6" stroke-linejoin="round"/>`;
			svg += pts.map((p) => `<circle cx="${p.split(" ")[0]}" cy="${p.split(" ")[1]}" r="2.4" fill="#fff" stroke="${line_color}" stroke-width="1.5"/>`).join("");
		}
		return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${svg}</svg>`, unit };
	}

	// Ranked list; items {label, value, sub, act, arg}.
	function rank(items, colors = ["#0e442e", "#1a6f4a", "#2b8b62", "#5aa584", "#8fbfa8", "#b7d6c7"]) {
		if (!items.length) return `<div class="empty">${__("Nothing to rank in this period.")}</div>`;
		const max = Math.max(...items.map((i) => i.value), 1);
		return `<div class="rk">${items.map((it, i) => `<div${act_attrs(it.act, it.arg)}>
			<div class="rk-r"><span class="rk-d" style="background:${colors[i % colors.length]}"></span><span class="rk-n">${esc(it.label)}</span>
			<span class="rk-v">${esc(fmt.compact(it.value))}<em>${it.sub ? ` · ${esc(it.sub)}` : ""}</em></span></div>
			<div class="rk-t"><div class="rk-f" style="width:${Math.max((it.value / max) * 100, 2).toFixed(0)}%;background:${colors[i % colors.length]}"></div></div></div>`).join("")}</div>`;
	}

	// A composition: one bar plus a row per part; parts {label, value, color, count, act, arg}.
	function composition(parts, value_text = (p) => fmt.compact(p.value)) {
		const total = parts.reduce((s, p) => s + Math.max(p.value, 0), 0);
		if (!total) return `<div class="empty">${__("Nothing in this period.")}</div>`;
		return `${mini.segmented(parts).split('<div class="sg-l">')[0]}<div class="sg-rows">${parts.map((p) => `<div class="sg-row"${act_attrs(p.act, p.arg)}>
			<i style="background:${p.color}"></i><span class="n">${esc(p.label)}${p.count != null ? ` · ${esc(p.count)}` : ""}</span>
			<span class="p">${fmt.pct((p.value / total) * 100, 0)}</span><span class="v">${esc(value_text(p))}</span></div>`).join("")}</div>`;
	}

	// Segmented mini-bar for a card (no legend rows).
	const seg_bar = (parts) => mini.segmented(parts).split('<div class="sg-l">')[0];

	function render(report, build) {
		if ((frappe.get_route() || [])[0] !== "query-report") return;
		const msg = report.raw_data && report.raw_data.message;
		const has_rows = report.data && report.data.length;
		const meta = has_rows && msg && msg.epc_header ? msg : null;
		if (meta) fmt.use_currency(meta.currency.code, meta.currency.symbol, meta.currency.on_right);
		const out = meta ? build(meta) : { html: `<div class="surf card"><div class="empty">${__("No rows for the selected filters.")}</div></div>`, actions: {} };
		const root = mount(report);
		root.innerHTML = `<style>${epcforge.boq_dashboard.CSS}${CSS}</style><div class="cd rh">${out.html}</div>`;
		root.querySelectorAll("[data-act]").forEach((el) => {
			const handler = (out.actions || {})[el.dataset.act];
			if (!handler) return;
			el.addEventListener("click", (e) => {
				e.stopPropagation();
				handler(el.dataset.arg ? JSON.parse(el.dataset.arg) : null, report);
			});
		});
	}

	// One host per report page, placed after the filter bar (with fallbacks across Desk versions).
	function mount(report) {
		const $wrap = report.page.wrapper;
		let host = $wrap.find(".epc-report-header")[0];
		if (!host) {
			host = document.createElement("div");
			host.className = "epc-report-header";
			host.style.cssText = "padding:0 var(--padding-md, 15px)";
			const anchor = $wrap.find(".page-form").first();
			if (anchor.length) anchor.after(host);
			else ($wrap.find(".report-wrapper, .result, .datatable-wrapper").first()[0] || $wrap.find(".layout-main-section")[0]).before(host);
			host.attachShadow({ mode: "open" });
		}
		return host.shadowRoot;
	}

	// Drill helpers shared by the reports.
	const set_filters = (report, values) => {
		report.set_filter_value(values);
		const $table = report.page.wrapper.find(".report-wrapper, .datatable-wrapper").first();
		if ($table.length) $("html, body").animate({ scrollTop: Math.max(0, $table.offset().top - 80) }, 300);
	};

	const subtitle = (meta, unit) => {
		const p = meta.period || {};
		const range = p.from_date && p.to_date ? `${fmt.date(p.from_date)} – ${fmt.date(p.to_date)}` : "";
		return [range, unit ? `${meta.currency.code} ${unit}` : ""].filter(Boolean).join(", ");
	};

	return { CSS, fmt, mini, esc, money, count, card, bars, rank, composition, seg_bar, render, set_filters, subtitle, act_attrs };
})();
