// Copyright (c) 2026, Invento Software Limited and contributors
// For license information, please see license.txt

frappe.pages["project-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Project Dashboard"),
		single_column: true,
	});

	// Frappe's page.scss caps .layout-main-section-wrapper at width:80% even
	// with single_column:true (meant to leave room for a sidebar that isn't
	// here). This dashboard's charts want the full page width.
	page.wrapper.find(".layout-main-section-wrapper").css({ width: "100%", flex: "1 0 100%" });
	page.body.css("padding", "var(--padding-xs) var(--padding-md)");

	ensure_pd_styles();
	ensure_pd_resize_listener();

	const project_field = page.add_field({
		label: __("Project"),
		fieldtype: "Link",
		options: "Project",
		fieldname: "project",
		change() {
			const val = project_field.get_value();
			if (val) load_dashboard(page, val);
		},
	});

	page.add_inner_button(__("Refresh"), () => {
		const val = project_field.get_value();
		if (val) load_dashboard(page, val);
	});

	frappe.call({
		method: "epcforge.epcforge.page.project_dashboard.project_dashboard.get_projects_list",
		callback(r) {
			const projects = r.message || [];
			const active = projects.find((p) => p.is_active) || projects[0];
			if (active) {
				project_field.set_value(active.value);
			} else {
				$(page.body).html(pd_empty_state(__("No projects found.")));
			}
		},
	});
};

function load_dashboard(page, project_id) {
	$(page.body).html(pd_loading_state());

	frappe.call({
		method: "epcforge.epcforge.page.project_dashboard.project_dashboard.get_dashboard_data",
		args: { project_id },
		callback(r) {
			if (!r.message) return;
			$(page.body).html(build_layout(r.message));
			redraw_pd_bar_charts();
		},
		error() {
			$(page.body).html(pd_empty_state(__("Could not load the dashboard for this project.")));
		},
	});
}

// ---------------------------------------------------------------------------
// Palette (design-system.md — seven hues, each with a deep/mid pair)
// ---------------------------------------------------------------------------

const PD_COLOR = {
	green_deep: "#0a5a3c",
	green_mid: "#097C52",
	teal_deep: "#17505d",
	teal_mid: "#17626e",
	steel_deep: "#22405e",
	steel_mid: "#2f5a86",
	amber_deep: "#7a4f12",
	amber_mid: "#8a5a16",
	rust_deep: "#8a4527",
	rust_mid: "#a3552f",
	claret_deep: "#7e2a30",
	claret_mid: "#a3302f",
	slate_deep: "#3b4757",
	slate_mid: "#5c6672",
	ink: "#0d1117",
	mid: "#5c6672",
	soft: "#98a1ac",
	rule: "#e3e7ec",
	rule2: "#f0f3f6",
};

const PD_HEALTH_COLOR = { Green: PD_COLOR.green_deep, Yellow: PD_COLOR.amber_deep, Red: PD_COLOR.claret_deep };
const PD_SCHED_COLOR = {
	"On Track": PD_COLOR.green_deep,
	Completed: PD_COLOR.teal_deep,
	Delayed: PD_COLOR.amber_deep,
	"Severely Delayed": PD_COLOR.claret_deep,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

// Set once per render so fmt_val()/fmt_val_short() can pick South-Asian
// lakh/crore vs international K/M/B compacting without threading the
// currency code through every chart-building function (design-system.md's
// "Currency" section — never freeze one convention regardless of currency).
let pd_currency_code = "";

function build_layout(data) {
	const { project, budget, boq, currency } = data;
	pd_currency_code = currency || "";
	pd_pending_charts = [];
	const symbol = currency_symbol(currency);

	if (!boq) {
		return `
			<div class="pd">
				${pd_header(project, budget, boq, symbol)}
				<div class="pd-card pd-dashed">${__("This project doesn't have a BOQ yet.")}</div>
			</div>`;
	}

	return `
		<div class="pd">
			${pd_header(project, budget, boq, symbol)}
			${metric_row_1(project, budget, boq, symbol)}
			${metric_row_2(budget, symbol)}
			${procurement_stage_strip(data.procurement.kpis)}

			<div class="pd-ch2">
				<div class="pd-card">
					<div class="pd-hrow"><span>${__("Procurement Coverage by Item")}</span><span class="pd-sub">${__(
						"MR · PO · GR"
					)}</span></div>
					${procurement_item_rows(data.procurement.items)}
				</div>
				<div class="pd-card">
					<div class="pd-hrow"><span>${__("Procurement Split")}</span></div>
					${procurement_split_donut(data.procurement.kpis, symbol)}
				</div>
			</div>

			<div class="pd-ch2">
				<div class="pd-card">
					<div class="pd-hrow"><span>${__("Cost by Item Type")}</span></div>
					${cost_by_type_chart(data.cost_by_type, symbol)}
				</div>
				<div class="pd-card">
					<div class="pd-hrow"><span>${__("Budget by Cost Head")}</span></div>
					${cost_by_head_chart(data.cost_by_head, symbol)}
				</div>
			</div>

			<div class="pd-ch2">
				<div class="pd-card">
					<div class="pd-hrow"><span>${__("Payment Milestones")}</span></div>
					${payment_milestones_donut(data.payment_milestones.kpis, symbol)}
				</div>
				<div class="pd-card">
					<div class="pd-hrow"><span>${__("Phase Progress")}</span></div>
					${phase_progress_rows(data.phase_progress)}
				</div>
			</div>

			${milestone_table(data.payment_milestones.rows, symbol)}
		</div>`;
}

function pd_header(project, budget, boq, symbol) {
	const name = project.project_name || "";
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();

	const health = budget ? budget.epc_health : null;
	const sched = budget ? budget.epc_sched_status : null;
	const meta = [project.status, health ? `${__("Health")}: ${health}` : null, sched]
		.filter(Boolean)
		.map((t) => frappe.utils.escape_html(t))
		.join(" · ");

	return `
		<div class="pd-hd">
			<div class="pd-hd-tile">${frappe.utils.escape_html(initials || "P")}</div>
			<div class="pd-hd-body">
				<div class="pd-hd-name">${frappe.utils.escape_html(name)}</div>
				<div class="pd-hd-meta">${meta}</div>
			</div>
			<div class="pd-hd-figs">
				<div class="pd-hd-fig">
					<div class="pd-micro">${__("Contract Value")}</div>
					<div class="pd-hd-figv">${symbol}${fmt_val(boq ? boq.total_amount : 0)}</div>
				</div>
				<div class="pd-hd-fig">
					<div class="pd-micro">${__("Complete")}</div>
					<div class="pd-hd-figv">${flt2(project.percent_complete)}%</div>
				</div>
			</div>
		</div>`;
}

function metric_row_1(project, budget, boq, symbol) {
	const composition = proportion_bar(
		[
			{ value: Math.max(flt(budget && budget.actual_cost), 0), color: PD_COLOR.green_deep },
			{ value: Math.max(flt(budget && budget.committed_amount), 0), color: PD_COLOR.amber_mid },
			{ value: Math.max(flt(budget && budget.remaining_budget), 0), color: PD_COLOR.rule },
		],
		190,
		8
	);

	const health = budget ? budget.epc_health : null;
	const sched = budget ? budget.epc_sched_status : null;
	const planned_pct = planned_progress_pct(project);

	return `
		<div class="pd-card pd-mx">
			<div class="pd-mx-c">
				<div class="pd-k">${__("Contract Value")}</div>
				<div class="pd-v">${symbol}${fmt_val(boq.total_amount)}</div>
				<div class="pd-s">${__("Approved budget")} ${symbol}${fmt_val(budget && budget.approved_budget)}</div>
				<div class="pd-mx-sp">${composition}</div>
			</div>
			<div class="pd-mx-c">
				<div class="pd-k">${__("Budget Health")}</div>
				<div class="pd-v"><span class="pd-pill" style="background:${
					PD_HEALTH_COLOR[health] || PD_COLOR.slate_mid
				}">${frappe.utils.escape_html(health || "—")}</span></div>
				<div class="pd-s">${
					budget ? `CPI ${flt2(budget.cpi)} · SPI ${flt2(budget.epc_spi)}` : "—"
				}</div>
			</div>
			<div class="pd-mx-c">
				<div class="pd-k">${__("Schedule Status")}</div>
				<div class="pd-v"><span class="pd-pill" style="background:${
					PD_SCHED_COLOR[sched] || PD_COLOR.slate_mid
				}">${frappe.utils.escape_html(sched || "—")}</span></div>
				<div class="pd-s">${pd_date_range(project.expected_start_date, project.expected_end_date)}</div>
			</div>
			<div class="pd-mx-c">
				<div class="pd-k">${__("Project Complete")}</div>
				<div class="pd-v">${flt2(project.percent_complete)}<span class="pd-unit">%</span></div>
				<div class="pd-s">${__("Planned")} ${planned_pct.toFixed(0)}%</div>
				<div class="pd-mx-sp">${linear_gauge(flt(project.percent_complete), planned_pct, PD_COLOR.green_mid)}</div>
			</div>
		</div>`;
}

function metric_row_2(budget, symbol) {
	if (!budget) {
		return `<div class="pd-card pd-mx"><div class="pd-mx-c"><div class="pd-k">${__(
			"Project Budget"
		)}</div><div class="pd-v">—</div><div class="pd-s">${__(
			"No Project Budget has been created yet."
		)}</div></div></div>`;
	}

	const cpi = flt(budget.cpi);
	const spi = flt(budget.epc_spi);
	const cpi_color = cpi >= 1 ? PD_COLOR.green_deep : cpi >= 0.85 ? PD_COLOR.amber_deep : PD_COLOR.claret_deep;
	const spi_color = spi >= 1 ? PD_COLOR.green_deep : spi >= 0.85 ? PD_COLOR.amber_deep : PD_COLOR.claret_deep;

	const approved = flt(budget.approved_budget);
	const eac = flt(budget.eac);
	const eac_pct = approved ? (eac / approved) * 100 : 0;
	const eac_color = !approved ? PD_COLOR.slate_mid : eac <= approved ? PD_COLOR.green_deep : eac <= approved * 1.1 ? PD_COLOR.amber_deep : PD_COLOR.claret_deep;

	const cv = flt(budget.cost_variance);
	const cv_favorable = cv >= 0;
	const cv_color = cv_favorable ? PD_COLOR.green_mid : PD_COLOR.claret_mid;

	return `
		<div class="pd-card pd-mx">
			<div class="pd-mx-c">
				<div class="pd-k">CPI</div>
				<div class="pd-v" style="color:${cpi_color}">${flt2(cpi)}</div>
				<div class="pd-s">${__("Cost efficiency, target")} 1.00</div>
				<div class="pd-mx-sp">${linear_gauge(cpi * 100, 100, cpi_color)}</div>
			</div>
			<div class="pd-mx-c">
				<div class="pd-k">SPI</div>
				<div class="pd-v" style="color:${spi_color}">${flt2(spi)}</div>
				<div class="pd-s">${__("Schedule efficiency, target")} 1.00</div>
				<div class="pd-mx-sp">${linear_gauge(spi * 100, 100, spi_color)}</div>
			</div>
			<div class="pd-mx-c">
				<div class="pd-k">${__("Estimate at Completion")}</div>
				<div class="pd-v" style="color:${eac_color}">${symbol}${fmt_val(eac)}</div>
				<div class="pd-s">${__("Approved")} ${symbol}${fmt_val(approved)}</div>
				<div class="pd-mx-sp">${linear_gauge(eac_pct, 100, eac_color)}</div>
			</div>
			<div class="pd-mx-c tint">
				<div class="pd-k">${__("Cost Variance")}</div>
				<div class="pd-v" style="color:${cv_color}">${symbol}${fmt_val(cv)}</div>
				<div class="pd-s"><span class="pd-pill" style="background:${cv_color}">${
					cv_favorable ? "▲" : "▼"
				} ${symbol}${fmt_val(Math.abs(cv))}</span> ${__("vs contract value")}</div>
				<div class="pd-mx-sp">${bipolar_single(cv, PD_COLOR.green_mid, PD_COLOR.claret_mid)}</div>
			</div>
		</div>`;
}

function procurement_stage_strip(kpis) {
	kpis = kpis || {};
	const stages = [
		{ label: __("Material Requested"), key: "mr_coverage_pct", color: PD_COLOR.steel_deep },
		{ label: __("Purchase Ordered"), key: "po_coverage_pct", color: PD_COLOR.teal_deep },
		{ label: __("Received (GR)"), key: "pr_coverage_pct", color: PD_COLOR.green_deep },
	];
	const blocks = stages
		.map(
			(s) => `
			<div class="pd-stage" style="background:${s.color}">
				<div class="pd-stage-v">${flt2(kpis[s.key])}%</div>
				<div class="pd-stage-l">${s.label}</div>
			</div>`
		)
		.join("");

	return `
		<div class="pd-stage-sec">
			<div class="pd-micro pd-stage-title">${__("Procurement Pipeline")} · ${
				kpis.total_items || 0
			} ${__("stock items on BOQ")}</div>
			<div class="pd-stage-strip">${blocks}</div>
		</div>`;
}

function procurement_item_rows(items) {
	items = (items || []).slice(0, 10);
	if (!items.length) return pd_empty_note();

	const legend = `
		<div class="pd-pi-legend">
			<span><i style="background:${PD_COLOR.steel_mid}"></i>${__("MR")}</span>
			<span><i style="background:${PD_COLOR.teal_mid}"></i>${__("PO")}</span>
			<span><i style="background:${PD_COLOR.green_mid}"></i>${__("GR")}</span>
		</div>`;

	const rows = items
		.map(
			(it) => `
			<div class="pd-pi-row">
				<div class="pd-pi-name" title="${frappe.utils.escape_html(it.description || it.item_code || "")}">${frappe.utils.escape_html(
					(it.description || it.item_code || "").slice(0, 28)
				)}</div>
				<div class="pd-pi-tracks">
					${pi_track(it.mr_pct, PD_COLOR.steel_mid)}
					${pi_track(it.po_pct, PD_COLOR.teal_mid)}
					${pi_track(it.pr_pct, PD_COLOR.green_mid)}
				</div>
			</div>`
		)
		.join("");

	return `${legend}<div class="pd-pi-list">${rows}</div>`;
}

function pi_track(pct, color) {
	pct = Math.min(Math.max(flt(pct), 0), 100);
	return `
		<div class="pd-pi-track">
			<div class="pd-pi-fill" style="width:${pct}%;background:${color}"></div>
			<span class="pd-pi-pct">${pct.toFixed(0)}%</span>
		</div>`;
}

function procurement_split_donut(kpis, symbol) {
	kpis = kpis || {};
	const received = Math.max(flt(kpis.total_pr_value), 0);
	const ordered_not_received = Math.max(flt(kpis.total_po_value) - received, 0);
	const not_ordered = Math.max(flt(kpis.total_boq_value) - flt(kpis.total_po_value), 0);
	const total = received + ordered_not_received + not_ordered;
	if (total <= 0) return pd_empty_note();

	const parts = [
		{ label: __("Received"), value: received, color: PD_COLOR.green_deep },
		{ label: __("Ordered, not received"), value: ordered_not_received, color: PD_COLOR.amber_deep },
		{ label: __("Not yet ordered"), value: not_ordered, color: PD_COLOR.slate_deep },
	].map((p) => ({ ...p, pct: Math.round((p.value / total) * 100) }));

	return donut_chart(parts, { label: __("MATERIAL VALUE"), value: symbol + fmt_val(total) }, (p) => symbol + fmt_val(p.value));
}

function payment_milestones_donut(kpis, symbol) {
	kpis = kpis || {};
	const parts_raw = [
		{ label: __("Received"), value: Math.max(flt(kpis.received), 0), color: PD_COLOR.green_deep },
		{ label: __("Invoiced"), value: Math.max(flt(kpis.invoiced), 0), color: PD_COLOR.amber_deep },
		{ label: __("Pending"), value: Math.max(flt(kpis.pending), 0), color: PD_COLOR.slate_deep },
	];
	const total = parts_raw.reduce((s, p) => s + p.value, 0);
	if (total <= 0) return pd_empty_note();

	const parts = parts_raw.map((p) => ({ ...p, pct: Math.round((p.value / total) * 100) }));
	return donut_chart(parts, { label: __("TOTAL VALUE"), value: symbol + fmt_val(total) }, (p) => symbol + fmt_val(p.value));
}

// Grouped bar charts are sized to their real rendered column width (see
// redraw_pd_bar_charts) rather than a fixed literal — a hardcoded viewBox
// width looks fine at the column width it was authored for, but once the
// dashboard runs full-width the column is often wider than that literal,
// and the chart content doesn't grow with it (pattern-p-standalone-page.md's
// "Full-width hosting" section). Each chart is queued here and drawn once
// its container exists in the DOM.
let pd_pending_charts = [];

function cost_by_type_chart(cost_by_type, symbol) {
	const labels = Object.keys(cost_by_type || {});
	if (!labels.length) return pd_empty_note();

	const series = [
		{ name: __("Contract Value"), color: PD_COLOR.steel_mid, values: labels.map((l) => flt(cost_by_type[l].contract_value)) },
		{ name: __("Estimated Cost"), color: PD_COLOR.amber_mid, values: labels.map((l) => flt(cost_by_type[l].estimated_cost)) },
		{ name: __("Actual Cost"), color: PD_COLOR.claret_mid, values: labels.map((l) => flt(cost_by_type[l].actual_cost)) },
	];
	pd_pending_charts.push({ id: "pd-chart-cost-type", labels, series, symbol });
	return `<div id="pd-chart-cost-type" class="pd-chart-wrap"></div>`;
}

function cost_by_head_chart(rows, symbol) {
	rows = rows || [];
	if (!rows.length) return pd_empty_note();

	const labels = rows.map((r) => r.cost_head);
	const series = [
		{ name: __("Budget"), color: PD_COLOR.steel_mid, values: rows.map((r) => flt(r.budget_amount)) },
		{ name: __("Committed"), color: PD_COLOR.amber_mid, values: rows.map((r) => flt(r.committed_amount)) },
		{ name: __("Actual"), color: PD_COLOR.claret_mid, values: rows.map((r) => flt(r.actual_amount)) },
	];
	pd_pending_charts.push({ id: "pd-chart-cost-head", labels, series, symbol });
	return `<div id="pd-chart-cost-head" class="pd-chart-wrap"></div>`;
}

// Measures each queued chart's real container width (now that build_layout's
// HTML is in the DOM) and draws the SVG at that width instead of a fixed
// literal, so it fills the card instead of looking undersized next to a
// much wider full-width column. Kept (not cleared) so a window resize can
// redraw the same charts at their new width without a full data reload.
let pd_last_charts = [];

function redraw_pd_bar_charts() {
	if (pd_pending_charts.length) {
		pd_last_charts = pd_pending_charts;
		pd_pending_charts = [];
	}
	pd_last_charts.forEach((c) => {
		const el = document.getElementById(c.id);
		if (!el) return;
		const w = Math.max(280, el.clientWidth);
		const h = Math.max(220, Math.round(w * 0.24));
		el.innerHTML = grouped_bar_chart(c.labels, c.series, c.symbol, { w, h });
	});
}

let pd_resize_bound = false;

function ensure_pd_resize_listener() {
	if (pd_resize_bound) return;
	pd_resize_bound = true;
	let timer = null;
	$(window).on("resize.project-dashboard", () => {
		clearTimeout(timer);
		timer = setTimeout(redraw_pd_bar_charts, 150);
	});
}

function phase_progress_rows(phases) {
	if (!phases || !phases.length) return pd_empty_note();

	const rows = phases
		.map(
			(p) => `
			<div class="pd-pr-row">
				<div class="pd-pr-name">${frappe.utils.escape_html(p.phase)}</div>
				<div class="pd-pr-gauge">${linear_gauge(flt(p.percent_complete), 100, PD_COLOR.green_mid)}</div>
				<div class="pd-pr-pct">${flt2(p.percent_complete)}%</div>
			</div>`
		)
		.join("");

	return `<div class="pd-pr-list">${rows}</div>`;
}

function milestone_table(rows, symbol) {
	if (!rows || !rows.length) return "";

	const status_color = { Pending: PD_COLOR.slate_deep, Invoiced: PD_COLOR.amber_deep, Received: PD_COLOR.green_deep };

	let body = "";
	rows.forEach((m) => {
		const bg = status_color[m.payment_status] || status_color.Pending;
		const invoice = m.sales_invoice
			? `<a href="/app/sales-invoice/${frappe.utils.escape_html(m.sales_invoice)}">${frappe.utils.escape_html(
					m.sales_invoice
				)}</a>`
			: "—";
		body += `
			<tr>
				<td class="pd-tb-strong">${frappe.utils.escape_html(m.milestone || "")}</td>
				<td class="pd-tb-muted">${m.target_date || "—"}</td>
				<td class="pd-tb-num">${flt2(m.percent_amount)}%</td>
				<td class="pd-tb-num">${symbol}${fmt_val(m.net_payable)}</td>
				<td>${invoice}</td>
				<td class="pd-tb-center"><span class="pd-pill" style="background:${bg}">${frappe.utils.escape_html(
					m.payment_status || ""
				)}</span></td>
			</tr>`;
	});

	return `
		<div class="pd-card">
			<div class="pd-hrow"><span>${__("Milestone Schedule")}</span></div>
			<div class="pd-tb-wrap">
				<table class="pd-tb">
					<thead>
						<tr>
							<th>${__("Milestone")}</th>
							<th>${__("Due")}</th>
							<th class="pd-tb-num">%</th>
							<th class="pd-tb-num">${__("Net Payable")}</th>
							<th>${__("Invoice")}</th>
							<th class="pd-tb-center">${__("Status")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		</div>`;
}

// ---------------------------------------------------------------------------
// Chart primitives (chart-type-catalog.md, adapted for this page's data)
// ---------------------------------------------------------------------------

function linear_gauge(valuePct, targetPct, color) {
	const fillPct = Math.min(100, Math.max(0, flt(valuePct)));
	const tick = Math.min(100, Math.max(0, flt(targetPct)));
	return `<div class="pd-pg">
		<div class="pd-pg-t">
			<div class="pd-pg-f" style="width:${fillPct}%;background:${color}"></div>
			<i class="pd-pg-m" style="left:${tick}%"></i>
		</div>
	</div>`;
}

function bipolar_single(value, posColor, negColor) {
	const v = flt(value);
	const positive = v >= 0;
	const W = 190,
		H = 26,
		zeroY = H / 2;
	const h = H / 2 - 2;
	const y = positive ? zeroY - h : zeroY;
	return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">
		<line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" stroke="${PD_COLOR.rule}"/>
		<rect x="${W / 2 - 32}" y="${y.toFixed(1)}" width="64" height="${h.toFixed(1)}" rx="2" fill="${
			positive ? posColor : negColor
		}"/>
	</svg>`;
}

function proportion_bar(parts, width, height) {
	const w = width || 170,
		h = height || 9;
	const total = parts.reduce((s, p) => s + Math.max(p.value || 0, 0), 0) || 1;
	let x = 0;
	const rects = parts
		.map((p) => {
			const segW = (Math.max(p.value || 0, 0) / total) * w;
			const rect = `<rect x="${x.toFixed(2)}" y="0" width="${segW.toFixed(2)}" height="${h}" fill="${p.color}"/>`;
			x += segW;
			return rect;
		})
		.join("");
	return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">${rects}</svg>`;
}

function donut_chart(parts, center, fmtRow) {
	const cx = 104,
		cy = 118,
		r = 82,
		sw = 26;
	const circumference = 2 * Math.PI * r;
	let offset = 0,
		ringsSvg = "";
	parts.forEach((p) => {
		const frac = (p.pct || 0) / 100;
		const len = frac * circumference;
		ringsSvg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(
			2
		)} ${circumference.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(
			2
		)}" transform="rotate(-90 ${cx} ${cy})"><title>${frappe.utils.escape_html(p.label)}: ${frappe.utils.escape_html(
			fmtRow(p)
		)} (${p.pct || 0}%)</title></circle>`;
		offset += len;
	});

	let rowsSvg = "";
	parts.forEach((p, i) => {
		const y = 29 + i * 38;
		rowsSvg += `<rect x="222" y="${y}" width="3" height="26" fill="${p.color}"/>
			<text x="234" y="${y + 11}" font-size="11" font-weight="600" fill="${p.color}">${frappe.utils.escape_html(p.label)}</text>
			<text x="440" y="${y + 11}" font-size="11.5" font-weight="600" fill="${PD_COLOR.ink}" text-anchor="end">${frappe.utils.escape_html(
				fmtRow(p)
			)}</text>
			<text x="440" y="${y + 24}" font-size="9.5" fill="${PD_COLOR.mid}" text-anchor="end">${p.pct || 0}%</text>`;
	});

	// The ring (cy + r + half the stroke width) is taller than a 2-3 row
	// legend block — size the viewBox to whichever is actually tallest, or
	// the ring's bottom edge renders past the box and, with overflow:visible,
	// visibly spills out of the card underneath it.
	const ringBottom = cy + r + sw / 2 + 10;
	const legendBottom = 29 + parts.length * 38 + 10;
	const vbHeight = Math.max(ringBottom, legendBottom);

	return `<svg viewBox="0 0 440 ${vbHeight}" width="100%" style="display:block;max-width:420px;margin:0 auto;overflow:visible">
		<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PD_COLOR.rule2}" stroke-width="${sw}"/>
		${ringsSvg}
		<text x="${cx}" y="${cy - 6}" font-size="9" letter-spacing="1.4" fill="${PD_COLOR.ink}" text-anchor="middle">${frappe.utils.escape_html(
			center.label
		)}</text>
		<text x="${cx}" y="${cy + 14}" font-size="19" font-weight="600" fill="${PD_COLOR.ink}" text-anchor="middle" letter-spacing="-.6">${frappe.utils.escape_html(
			center.value
		)}</text>
		${rowsSvg}
	</svg>`;
}

function grouped_bar_chart(labels, series, symbol, opts) {
	opts = opts || {};
	const W = opts.w || 1040,
		H = opts.h || 230,
		ML = 56,
		MR = 12,
		MT = 16,
		MB = 34;
	const plotW = W - ML - MR,
		plotH = H - MT - MB;
	const n = labels.length;
	if (!n) return pd_empty_note();

	const allValues = series.reduce((acc, s) => acc.concat(s.values), []);
	const maxV = Math.max(0, Math.max.apply(null, allValues.concat([0])));
	const rawStep = maxV / 4 || 1;
	const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
	const norms = [1, 2, 2.5, 5, 10];
	let step = mag * 10;
	for (const norm of norms) {
		if (rawStep <= norm * mag) {
			step = norm * mag;
			break;
		}
	}
	const topV = Math.ceil(maxV / step) * step || step;
	const scale = plotH / topV;
	const yFor = (v) => MT + (topV - v) * scale;
	const baseY = yFor(0);

	let gridSvg = "";
	for (let v = 0; v <= topV + 1e-6; v += step) {
		const y = yFor(v);
		gridSvg += `<line x1="${ML}" x2="${W - MR}" y1="${y.toFixed(1)}" y2="${y.toFixed(
			1
		)}" stroke="${PD_COLOR.rule2}"/><text x="${ML - 8}" y="${(y + 3.5).toFixed(
			1
		)}" font-size="9.5" fill="${PD_COLOR.soft}" text-anchor="end">${symbol}${fmt_val_short(v)}</text>`;
	}

	const colW = plotW / n;
	const groupW = Math.min(colW * 0.72, 120);
	const barW = Math.max(6, groupW / series.length - 4);
	let barsSvg = "",
		labelsSvg = "";
	for (let i = 0; i < n; i++) {
		const groupX = ML + (i + 0.5) * colW - groupW / 2;
		series.forEach((s, si) => {
			const bx = groupX + si * (barW + 4);
			const v = s.values[i] || 0;
			const barH = v * scale;
			const title = frappe.utils.escape_html(`${labels[i]} — ${s.name}: ${symbol}${fmt_val(v)}`);
			barsSvg += `<rect x="${bx.toFixed(1)}" y="${(baseY - barH).toFixed(1)}" width="${barW.toFixed(
				1
			)}" height="${barH.toFixed(1)}" fill="${s.color}" rx="2"><title>${title}</title></rect>`;
		});
		const rawLabel = String(labels[i] || "");
		const shortLabel = rawLabel.length > 16 ? rawLabel.slice(0, 15) + "…" : rawLabel;
		labelsSvg += `<text x="${(ML + (i + 0.5) * colW).toFixed(
			1
		)}" y="${H - 12}" font-size="10" fill="${PD_COLOR.mid}" text-anchor="middle">${frappe.utils.escape_html(
			shortLabel
		)}</text>`;
	}

	const legend = series
		.map((s) => `<span class="pd-lg-i"><i style="background:${s.color}"></i>${frappe.utils.escape_html(s.name)}</span>`)
		.join("");

	return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${gridSvg}${barsSvg}${labelsSvg}</svg><div class="pd-legend">${legend}</div>`;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function pd_empty_note() {
	return `<div class="pd-empty">${__("Nothing to show yet")}</div>`;
}

function pd_empty_state(msg) {
	return `<div class="pd"><div class="pd-card pd-dashed">${frappe.utils.escape_html(msg)}</div></div>`;
}

function pd_loading_state() {
	return `<div class="pd"><div class="pd-card pd-dashed">${__("Loading…")}</div></div>`;
}

function pd_date_range(start, end) {
	if (!start && !end) return "—";
	const f = (d) => (d ? frappe.datetime.str_to_user(d) : "—");
	return `${f(start)} → ${f(end)}`;
}

function planned_progress_pct(project) {
	const start = project.expected_start_date,
		end = project.expected_end_date;
	if (!start || !end) return flt(project.percent_complete);
	const startD = frappe.datetime.str_to_obj(start);
	const endD = frappe.datetime.str_to_obj(end);
	const today = new Date();
	const totalDays = (endD - startD) / 86400000;
	if (totalDays <= 0) return flt(project.percent_complete);
	const elapsed = Math.max(0, (today - startD) / 86400000);
	return Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
}

function flt(v) {
	const n = parseFloat(v);
	return isNaN(n) ? 0 : n;
}

function flt2(v) {
	return flt(v).toFixed(1);
}

function currency_symbol(currency) {
	currency = currency || frappe.boot?.sysdefaults?.currency || "";
	return (currency && frappe.model.get_currency_symbol && frappe.model.get_currency_symbol(currency)) || currency || "";
}

// South Asian currencies share the lakh/crore convention; everything else
// uses international K/M/B compacting (design-system.md's "Currency" rule —
// never freeze one scale regardless of the active currency).
function pd_is_south_asian_currency() {
	return ["BDT", "INR", "PKR", "NPR", "LKR"].includes(pd_currency_code);
}

function fmt_val(v) {
	v = flt(v);
	const neg = v < 0;
	v = Math.abs(v);
	let f, u;
	if (pd_is_south_asian_currency()) {
		if (v >= 1e7) {
			f = v / 1e7;
			u = "Cr";
		} else if (v >= 1e5) {
			f = v / 1e5;
			u = "L";
		} else if (v >= 1e3) {
			f = v / 1e3;
			u = "K";
		} else {
			return (neg ? "-" : "") + v.toFixed(2);
		}
	} else {
		if (v >= 1e9) {
			f = v / 1e9;
			u = "B";
		} else if (v >= 1e6) {
			f = v / 1e6;
			u = "M";
		} else if (v >= 1e3) {
			f = v / 1e3;
			u = "K";
		} else {
			return (neg ? "-" : "") + v.toFixed(2);
		}
	}
	const r = (f >= 10 ? f.toFixed(1) : f.toFixed(2)) + u;
	return neg ? "-" + r : r;
}

// Axis-tick variant of fmt_val: integers below the first scale step, no
// decimals above it — human-scale gridline labels per design-system.md, not
// full precision.
function fmt_val_short(v) {
	v = flt(v);
	const neg = v < 0;
	v = Math.abs(v);
	let r;
	if (pd_is_south_asian_currency()) {
		if (v >= 1e7) r = Math.round(v / 1e7) + "Cr";
		else if (v >= 1e5) r = Math.round(v / 1e5) + "L";
		else if (v >= 1e3) r = Math.round(v / 1e3) + "K";
		else r = Math.round(v).toString();
	} else {
		if (v >= 1e9) r = Math.round(v / 1e9) + "B";
		else if (v >= 1e6) r = Math.round(v / 1e6) + "M";
		else if (v >= 1e3) r = Math.round(v / 1e3) + "K";
		else r = Math.round(v).toString();
	}
	return neg ? "-" + r : r;
}

// ---------------------------------------------------------------------------
// Styles (design-system.md — injected once, scoped under .pd)
// ---------------------------------------------------------------------------

function ensure_pd_styles() {
	if (document.getElementById("pd-dashboard-styles")) return;
	const style = document.createElement("style");
	style.id = "pd-dashboard-styles";
	style.textContent = `
.pd { font-family: var(--font-stack); font-feature-settings: "tnum" 1; width: 100%; box-sizing: border-box; }
.pd-card { background:#fff; border:1px solid ${PD_COLOR.rule}; border-radius:8px; box-shadow:0 1px 1px rgba(16,24,40,.03), 0 12px 24px -22px rgba(16,24,40,.30); padding:16px; margin-top:25px; box-sizing:border-box; }
.pd-card:first-of-type { margin-top: 0; }
.pd-dashed { text-align:center; color:${PD_COLOR.soft}; padding:40px; border:1px dashed ${PD_COLOR.rule}; box-shadow:none; }
.pd-empty { padding:40px 0; text-align:center; color:${PD_COLOR.soft}; font-size:12px; }
.pd-micro { font-size:9px; font-weight:500; letter-spacing:.16em; text-transform:uppercase; color:${PD_COLOR.ink}; }

/* Header */
.pd-hd { display:flex; align-items:center; gap:16px; padding:18px 20px; border-radius:8px; position:relative;
	background: linear-gradient(105deg, #d6e9de, #d3e2ee, #ded6ec); overflow:hidden; }
.pd-hd::before { content:""; position:absolute; left:0; top:0; bottom:0; width:5px; background:linear-gradient(180deg, ${PD_COLOR.green_deep}, ${PD_COLOR.steel_deep}); }
.pd-hd-tile { width:44px; height:44px; border-radius:8px; background:${PD_COLOR.green_deep}; color:#fff; font-size:16px; font-weight:600; display:flex; align-items:center; justify-content:center; flex:none; }
.pd-hd-body { flex:1; min-width:0; }
.pd-hd-name { font-size:23px; font-weight:600; letter-spacing:-0.5px; color:${PD_COLOR.ink}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pd-hd-meta { font-size:10.5px; color:${PD_COLOR.mid}; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pd-hd-figs { display:flex; gap:26px; flex:none; }
.pd-hd-fig { text-align:right; }
.pd-hd-figv { font-size:20px; font-weight:600; letter-spacing:-0.5px; color:${PD_COLOR.ink}; margin-top:2px; }

/* Metric row */
.pd-mx { display:grid; grid-template-columns:repeat(4,1fr); gap:0; padding:0; }
.pd-mx-c { padding:14px 16px; border-right:1px solid ${PD_COLOR.rule}; display:flex; flex-direction:column; min-width:0; }
.pd-mx-c:last-child { border-right:none; }
.pd-mx-c.tint { background:#f8fafc; }
.pd-k { font-size:9px; font-weight:500; letter-spacing:.16em; text-transform:uppercase; color:${PD_COLOR.ink}; }
.pd-v { font-size:26px; font-weight:600; letter-spacing:-1.1px; color:${PD_COLOR.ink}; margin-top:6px; }
.pd-unit { font-size:14px; font-weight:400; color:${PD_COLOR.mid}; }
.pd-s { font-size:10.5px; color:${PD_COLOR.mid}; margin-top:4px; white-space:nowrap; min-height:20px; overflow:hidden; text-overflow:ellipsis; }
.pd-mx-sp { margin-top:auto; padding-top:8px; }

/* Pills */
.pd-pill { display:inline-block; padding:3px 9px; border-radius:5px; font-size:10.5px; font-weight:600; color:#fff; white-space:nowrap; }

/* Stage strip */
.pd-stage-sec { margin-top:30px; }
.pd-stage-title { margin-bottom:8px; }
.pd-stage-strip { display:flex; gap:2px; border-radius:8px; overflow:hidden; }
.pd-stage { flex:1; padding:14px 16px; color:#fff; }
.pd-stage-v { font-size:21px; font-weight:600; letter-spacing:-0.6px; }
.pd-stage-l { font-size:10.5px; opacity:.88; margin-top:2px; }

/* Two-column chart grid */
.pd-ch2 { display:grid; grid-template-columns:1.3fr 1fr; gap:34px; margin-top:25px; }
.pd-ch2 .pd-card { margin-top:0; }
@media (max-width: 992px) { .pd-ch2 { grid-template-columns:1fr; } }

.pd-hrow { display:flex; justify-content:space-between; align-items:baseline; font-size:12.5px; font-weight:600; letter-spacing:-0.1px; color:${PD_COLOR.ink}; margin-bottom:14px; }
.pd-sub { font-size:10.5px; font-weight:400; color:${PD_COLOR.mid}; }

/* Linear gauge */
.pd-pg-t { position:relative; height:6px; border-radius:3px; background:${PD_COLOR.rule2}; overflow:visible; }
.pd-pg-f { height:100%; border-radius:3px; }
.pd-pg-m { position:absolute; top:-3px; width:2px; height:12px; background:${PD_COLOR.ink}; }

/* Procurement per-item rows */
.pd-pi-legend { display:flex; gap:14px; font-size:9.5px; color:${PD_COLOR.mid}; margin-bottom:10px; }
.pd-pi-legend span { display:flex; align-items:center; gap:4px; }
.pd-pi-legend i { width:7px; height:7px; display:inline-block; border-radius:2px; }
.pd-pi-list { display:flex; flex-direction:column; gap:10px; }
.pd-pi-row { display:grid; grid-template-columns:150px 1fr; gap:12px; align-items:center; }
.pd-pi-name { font-size:11.5px; color:${PD_COLOR.ink}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pd-pi-tracks { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
.pd-pi-track { position:relative; height:14px; border-radius:3px; background:${PD_COLOR.rule2}; overflow:hidden; }
.pd-pi-fill { position:absolute; left:0; top:0; height:100%; border-radius:3px; }
.pd-pi-pct { position:absolute; right:4px; top:0; height:100%; display:flex; align-items:center; font-size:8.5px; font-weight:600; color:${PD_COLOR.ink}; }

/* Phase progress rows */
.pd-pr-list { display:flex; flex-direction:column; gap:12px; }
.pd-pr-row { display:grid; grid-template-columns:150px 1fr 40px; gap:12px; align-items:center; }
.pd-pr-name { font-size:11.5px; color:${PD_COLOR.ink}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pd-pr-pct { font-size:11px; font-weight:600; color:${PD_COLOR.ink}; text-align:right; }

/* Bar chart legend */
.pd-legend { display:flex; justify-content:center; gap:16px; margin-top:8px; }
.pd-lg-i { font-size:10.5px; color:${PD_COLOR.mid}; display:flex; align-items:center; gap:5px; }
.pd-lg-i i { width:8px; height:8px; display:inline-block; border-radius:2px; }

/* Table */
.pd-tb-wrap { overflow-x:auto; }
.pd-tb { width:100%; border-collapse:collapse; font-size:12px; min-width:560px; }
.pd-tb th { padding:8px 10px; text-align:left; font-size:9px; font-weight:500; letter-spacing:.16em; text-transform:uppercase; color:${PD_COLOR.ink}; border-bottom:1px solid ${PD_COLOR.rule}; }
.pd-tb td { padding:9px 10px; border-bottom:1px solid ${PD_COLOR.rule2}; color:${PD_COLOR.ink}; }
.pd-tb tr:last-child td { border-bottom:none; }
.pd-tb-strong { font-weight:600; }
.pd-tb-muted { color:${PD_COLOR.mid}; }
.pd-tb-num { text-align:right; }
.pd-tb-center { text-align:center; }
`;
	document.head.appendChild(style);
}
