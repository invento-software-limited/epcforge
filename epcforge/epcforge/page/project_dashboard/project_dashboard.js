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
	ensure_pd_chart_interactions();

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
	green_light: "#86efac",
	teal_deep: "#17505d",
	teal_mid: "#17626e",
	teal_light: "#5eead4",
	steel_deep: "#22405e",
	steel_mid: "#2f5a86",
	steel_light: "#93c5fd",
	amber_deep: "#7a4f12",
	amber_mid: "#8a5a16",
	amber_light: "#fcd34d",
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

function pd_status_bg(status) {
	if (!status) return "";
	const s = String(status).trim().toLowerCase();
	if (s === "green" || s === "on track" || s === "completed") return "#dcfce7";
	if (s === "yellow" || s === "delayed") return "#fef3c7";
	if (s === "red" || s === "severely delayed") return "#fee2e2";
	return "";
}

function pd_health_color(health) {
	if (!health) return PD_COLOR.slate_mid;
	const s = String(health).trim().toLowerCase();
	if (s === "green") return PD_COLOR.green_deep;
	if (s === "yellow") return PD_COLOR.amber_deep;
	if (s === "red") return PD_COLOR.claret_deep;
	return PD_HEALTH_COLOR[health] || PD_COLOR.slate_mid;
}

function pd_sched_color(sched) {
	if (!sched) return PD_COLOR.slate_mid;
	const s = String(sched).trim().toLowerCase();
	if (s === "on track") return PD_COLOR.green_deep;
	if (s === "completed") return PD_COLOR.teal_deep;
	if (s === "delayed") return PD_COLOR.amber_deep;
	if (s === "severely delayed") return PD_COLOR.claret_deep;
	return PD_SCHED_COLOR[sched] || PD_COLOR.slate_mid;
}

function cpi_tooltip_html() {
	return `
		<span class="pd-tip-box" role="tooltip">
			<strong class="pd-tip-title">${__("Cost Performance Index (CPI)")}</strong>
			<span class="pd-tip-formula">${__("Formula")}: EV ÷ AC (${__("Earned Value / Actual Cost")})</span>
			<ul class="pd-tip-list">
				<li><span class="pd-tip-good">≥ 1.0</span>: ${__("Under or on budget (Cost efficient)")}</li>
				<li><span class="pd-tip-bad">&lt; 1.0</span>: ${__("Over budget (Cost overrun)")}</li>
			</ul>
			<span class="pd-tip-desc">${__("Measures cost efficiency of work accomplished.")}</span>
		</span>`;
}

function spi_tooltip_html() {
	return `
		<span class="pd-tip-box" role="tooltip">
			<strong class="pd-tip-title">${__("Schedule Performance Index (SPI)")}</strong>
			<span class="pd-tip-formula">${__("Formula")}: EV ÷ PV (${__("Earned Value / Planned Value")})</span>
			<ul class="pd-tip-list">
				<li><span class="pd-tip-good">≥ 1.0</span>: ${__("On or ahead of schedule")}</li>
				<li><span class="pd-tip-bad">&lt; 1.0</span>: ${__("Behind schedule (Delayed)")}</li>
			</ul>
			<span class="pd-tip-desc">${__("Measures progress against the project schedule.")}</span>
		</span>`;
}

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
			${procurement_stage_strip(data.procurement.kpis, symbol)}

			<div class="pd-ch2">
				<div class="pd-card">
					<div class="pd-hrow"><span>${__("Procurement Coverage by Item")}</span><span class="pd-sub">${__(
						"MR · PO · GR · Paid"
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
					<div class="pd-hrow"><span>${__("Payment Milestones (Sales)")}</span></div>
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
	const remaining_pct = Math.max(0, 100 - flt(project.percent_complete));
	const duration_days = project_duration_days(project.expected_start_date, project.expected_end_date);

	const cpi = budget ? flt(budget.cpi) : 0;
	const spi = budget ? flt(budget.epc_spi) : 0;
	const cpi_color = cpi >= 1 ? PD_COLOR.green_deep : cpi >= 0.85 ? PD_COLOR.amber_deep : PD_COLOR.claret_deep;
	const spi_color = spi >= 1 ? PD_COLOR.green_deep : spi >= 0.85 ? PD_COLOR.amber_deep : PD_COLOR.claret_deep;

	const health_bg = budget && health ? pd_status_bg(health) : "";
	const health_color = pd_health_color(health);
	const sched_bg = sched ? pd_status_bg(sched) : "";
	const sched_color = pd_sched_color(sched);

	const cpi_tip_plain = `${__("Cost Performance Index (CPI)")}\n${__("Formula")}: EV ÷ AC (${__("Earned Value / Actual Cost")})\n• ${__("≥ 1.0: Under/on budget")}\n• ${__("< 1.0: Over budget")}`;
	const spi_tip_plain = `${__("Schedule Performance Index (SPI)")}\n${__("Formula")}: EV ÷ PV (${__("Earned Value / Planned Value")})\n• ${__("≥ 1.0: On/ahead of schedule")}\n• ${__("< 1.0: Behind schedule")}`;

	return `
		<div class="pd-card pd-mx">
			<div class="pd-mx-c">
				<div class="pd-k">${__("Contract Value")}</div>
				<div class="pd-v">${symbol}${fmt_val(boq.total_amount)}</div>
				<div class="pd-s">${__("Approved budget")} ${symbol}${fmt_val(budget && budget.approved_budget)}</div>
				<div class="pd-mx-sp">${composition}</div>
			</div>
			<div class="pd-mx-c pd-status-col" style="${health_bg ? `background:${health_bg};` : ""}">
				<div class="pd-k">${__("Budget Health")}</div>
				<div class="pd-v">
					<span class="pd-pill pd-pill-lg" style="background:${health_color}">
						<span class="pd-pill-dot"></span>
						${frappe.utils.escape_html(health || "—")}
					</span>
				</div>
				<div class="pd-s pd-has-tips">
					${
						budget
							? `
						<span class="pd-kpi-chip pd-tip" title="${frappe.utils.escape_html(cpi_tip_plain)}">
							<span class="pd-kpi-lbl">CPI</span>
							<strong class="pd-kpi-num" style="color:${cpi_color}">${flt2(budget.cpi)}</strong>
							<i class="pd-info-icon">ⓘ</i>
							${cpi_tooltip_html()}
						</span>
						<span class="pd-sep">·</span>
						<span class="pd-kpi-chip pd-tip" title="${frappe.utils.escape_html(spi_tip_plain)}">
							<span class="pd-kpi-lbl">SPI</span>
							<strong class="pd-kpi-num" style="color:${spi_color}">${flt2(budget.epc_spi)}</strong>
							<i class="pd-info-icon">ⓘ</i>
							${spi_tooltip_html()}
						</span>`
							: "—"
					}
				</div>
				<div class="pd-mx-sp">${budget ? linear_gauge(cpi ? Math.min(cpi * 100, 150) : 0, 100, health_color) : ""}</div>
			</div>
			<div class="pd-mx-c pd-status-col" style="${sched_bg ? `background:${sched_bg};` : ""}">
				<div class="pd-k">${__("Schedule Status")}</div>
				<div class="pd-v">
					<span class="pd-pill pd-pill-lg" style="background:${sched_color}">
						<span class="pd-pill-dot"></span>
						${frappe.utils.escape_html(sched || "—")}
					</span>
				</div>
				<div class="pd-s">
					<span class="pd-date-chip" title="${duration_days ? `${duration_days} ${__("days total")}` : ""}">
						<span class="pd-date-icon">📅</span>
						<span class="pd-kpi-lbl">${__("Duration")}:</span>
						<strong>${pd_date_range(project.expected_start_date, project.expected_end_date)}</strong>
					</span>
				</div>
				<div class="pd-mx-sp">${linear_gauge(planned_pct, 100, sched_color)}</div>
			</div>
			<div class="pd-mx-c">
				<div class="pd-k">${__("Project Complete")}</div>
				<div class="pd-v">${flt2(project.percent_complete)}<span class="pd-unit">%</span></div>
				<div class="pd-s pd-has-tips">
					${
						project.total_tasks
							? `
						<span class="pd-kpi-chip" title="${project.completed_tasks} ${__("of")} ${project.total_tasks} ${__("tasks completed")}">
							<span class="pd-kpi-lbl">${__("Tasks")}</span>
							<strong class="pd-kpi-num">${project.completed_tasks}/${project.total_tasks}</strong>
						</span>
						<span class="pd-sep">·</span>
						<span class="pd-kpi-chip" title="${flt2(remaining_pct)}% ${__("remaining to completion")}">
							<span class="pd-kpi-lbl">${__("Remaining")}</span>
							<strong class="pd-kpi-num">${flt2(remaining_pct)}%</strong>
						</span>`
							: `
						<span class="pd-kpi-chip">
							<span class="pd-kpi-lbl">${__("Status")}</span>
							<strong class="pd-kpi-num">${frappe.utils.escape_html(project.status || "Open")}</strong>
						</span>
						<span class="pd-sep">·</span>
						<span class="pd-kpi-chip" title="${flt2(remaining_pct)}% ${__("remaining to completion")}">
							<span class="pd-kpi-lbl">${__("Remaining")}</span>
							<strong class="pd-kpi-num">${flt2(remaining_pct)}%</strong>
						</span>`
					}
				</div>
				<div class="pd-mx-sp">${linear_gauge(flt(project.percent_complete), 100, PD_COLOR.green_mid)}</div>
			</div>
		</div>`;
}

function procurement_stage_strip(kpis, symbol) {
	kpis = kpis || {};
	symbol = symbol || currency_symbol(pd_currency_code);
	const stages = [
		{ label: __("Material Requested"), key: "mr_coverage_pct", val_key: "total_mr_value", color: PD_COLOR.steel_deep },
		{ label: __("Purchase Ordered"), key: "po_coverage_pct", val_key: "total_po_value", color: PD_COLOR.teal_deep },
		{ label: __("Received (GR)"), key: "pr_coverage_pct", val_key: "total_pr_value", color: PD_COLOR.green_deep },
		{ label: __("Paid"), key: "paid_coverage_pct", val_key: "total_paid_value", color: PD_COLOR.amber_deep },
	];
	const blocks = stages
		.map(
			(s) => `
			<div class="pd-stage" style="background:${s.color}" title="${frappe.utils.escape_html(s.label)}: ${flt2(kpis[s.key])}%${s.val_key && kpis[s.val_key] != null ? ` (${symbol}${fmt_val(kpis[s.val_key])})` : ""}">
				<div class="pd-stage-v">${flt2(kpis[s.key])}%</div>
				<div class="pd-stage-l">${s.label}</div>
				${s.val_key && kpis[s.val_key] != null ? `<div class="pd-stage-s">${symbol}${fmt_val(kpis[s.val_key])}</div>` : ""}
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
			<span><i style="background:${PD_COLOR.steel_light}"></i>${__("MR")}</span>
			<span><i style="background:${PD_COLOR.teal_light}"></i>${__("PO")}</span>
			<span><i style="background:${PD_COLOR.green_light}"></i>${__("GR")}</span>
			<span><i style="background:${PD_COLOR.amber_light}"></i>${__("Paid")}</span>
		</div>`;

	const rows = items
		.map(
			(it) => `
			<div class="pd-pi-row">
				<div class="pd-pi-name" title="${frappe.utils.escape_html(it.description || it.item_code || "")}">${frappe.utils.escape_html(
					(it.description || it.item_code || "").slice(0, 28)
				)}</div>
				<div class="pd-pi-tracks">
					${pi_track(it.mr_pct, PD_COLOR.steel_light)}
					${pi_track(it.po_pct, PD_COLOR.teal_light)}
					${pi_track(it.pr_pct, PD_COLOR.green_light)}
					${pi_track(it.paid_pct, PD_COLOR.amber_light)}
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
		{ label: __("Not yet ordered"), value: not_ordered, color: PD_COLOR.slate_deep },
		{ label: __("Ordered, not received"), value: ordered_not_received, color: PD_COLOR.amber_deep },
		{ label: __("Received"), value: received, color: PD_COLOR.green_deep },
	].map((p) => ({ ...p, pct: Math.round((p.value / total) * 100) }));

	return donut_chart(parts, { label: __("MATERIAL VALUE"), value: symbol + fmt_val(total) }, (p) => symbol + fmt_val(p.value));
}

function payment_milestones_donut(kpis, symbol) {
	kpis = kpis || {};
	const parts_raw = [
		{ label: __("Pending"), value: Math.max(flt(kpis.pending), 0), color: PD_COLOR.slate_deep },
		{ label: __("Invoiced"), value: Math.max(flt(kpis.invoiced), 0), color: PD_COLOR.amber_deep },
		{ label: __("Received"), value: Math.max(flt(kpis.received), 0), color: PD_COLOR.green_deep },
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
let pd_charts_data = {};

function redraw_pd_bar_charts() {
	if (pd_pending_charts.length) {
		pd_last_charts = pd_pending_charts;
		pd_pending_charts = [];
	}
	pd_last_charts.forEach((c) => {
		const el = document.getElementById(c.id);
		if (!el) return;
		pd_charts_data[c.id] = c;
		const w = Math.max(280, el.clientWidth);
		const n = (c.labels && c.labels.length) || 1;
		const rotate = (w - 68) / n < 110 || (c.labels && c.labels.some((l) => String(l).length > 10));
		const h = Math.max(rotate ? 260 : 220, Math.round(w * (rotate ? 0.3 : 0.24)));
		el.innerHTML = grouped_bar_chart(c.labels, c.series, c.symbol, { w, h, id: c.id });
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

	// Mobile / click toggle for tooltips
	$(document).on("click.project-dashboard", ".pd-tip", function (e) {
		e.stopPropagation();
		const $this = $(this);
		const wasActive = $this.hasClass("pd-tip-active");
		$(".pd-tip-active").removeClass("pd-tip-active");
		if (!wasActive) {
			$this.addClass("pd-tip-active");
		}
	});

	$(document).on("click.project-dashboard", () => {
		$(".pd-tip-active").removeClass("pd-tip-active");
	});
}

let pd_charts_bound = false;

function ensure_pd_chart_interactions() {
	if (pd_charts_bound) return;
	pd_charts_bound = true;

	function show_chart_tip(e, targetEl) {
		const $target = $(targetEl);
		const $wrap = $target.closest(".pd-chart-wrap");
		const chartId = $wrap.attr("id");
		const c = pd_charts_data[chartId];
		if (!c) return;

		const groupIdx = parseInt($target.attr("data-group-idx"), 10);
		const seriesIdxAttr = $target.attr("data-series-idx");
		const seriesIdx =
			seriesIdxAttr !== undefined && seriesIdxAttr !== null && seriesIdxAttr !== ""
				? parseInt(seriesIdxAttr, 10)
				: null;

		if (isNaN(groupIdx) || groupIdx < 0 || groupIdx >= c.labels.length) return;

		const groupLabel = c.labels[groupIdx];
		const symbol = c.symbol || "";

		let rowsHtml = "";
		c.series.forEach((s, idx) => {
			const val = flt(s.values[groupIdx]);
			const isActive = seriesIdx !== null && idx === seriesIdx;
			const compactVal = (symbol ? symbol + " " : "") + fmt_val(val);
			const fullVal = fmt_full_val(val);
			const showFull = fullVal && fullVal !== compactVal && Math.abs(val) >= 1000;

			rowsHtml += `
				<div class="pd-ct-row ${isActive ? "is-active" : ""}">
					<span class="pd-ct-dot" style="background:${s.color}"></span>
					<span class="pd-ct-name">${frappe.utils.escape_html(s.name)}</span>
					<span class="pd-ct-val">${frappe.utils.escape_html(compactVal)}</span>
					${showFull ? `<span class="pd-ct-full">(${frappe.utils.escape_html(fullVal)})</span>` : ""}
				</div>
			`;
		});

		const tipHtml = `
			<div class="pd-ct-head">${frappe.utils.escape_html(groupLabel)}</div>
			<div class="pd-ct-rows">${rowsHtml}</div>
		`;

		const $tip = $wrap.find(".pd-chart-tip");
		$tip.html(tipHtml).show();
		$wrap.addClass("has-hover");

		// Highlight column background and x-axis label
		$wrap.find(".pd-col-bg").hide();
		$wrap.find(`.pd-col-bg[data-group-idx="${groupIdx}"]`).show();
		$wrap.find(".pd-chart-xlabel").removeClass("is-active");
		$wrap.find(`.pd-chart-xlabel[data-group-idx="${groupIdx}"]`).addClass("is-active");

		// Highlight specific active bar
		$wrap.find(".pd-chart-bar").removeClass("is-active");
		if (seriesIdx !== null) {
			$wrap
				.find(`.pd-chart-bar[data-group-idx="${groupIdx}"][data-series-idx="${seriesIdx}"]`)
				.addClass("is-active");
		}

		position_chart_tip(e, $wrap, $tip);
	}

	function position_chart_tip(e, $wrap, $tip) {
		const wrapOffset = $wrap.offset();
		if (!wrapOffset) return;

		const mouseX = e.pageX - wrapOffset.left;
		const mouseY = e.pageY - wrapOffset.top;
		const wrapW = $wrap.width();
		const wrapH = $wrap.height();
		const tipW = $tip.outerWidth() || 220;
		const tipH = $tip.outerHeight() || 100;

		let left = mouseX + 16;
		if (left + tipW > wrapW - 8) {
			left = mouseX - tipW - 16;
		}
		if (left < 8) left = 8;

		let top = mouseY - tipH - 12;
		if (top < 8) {
			top = mouseY + 18;
		}
		if (top + tipH > wrapH - 8) {
			top = Math.max(8, wrapH - tipH - 8);
		}

		$tip.css({ left: `${left}px`, top: `${top}px` });
	}

	function hide_chart_tip($wrap) {
		$wrap.find(".pd-chart-tip").hide();
		$wrap.removeClass("has-hover");
		$wrap.find(".pd-col-bg").hide();
		$wrap.find(".pd-chart-bar").removeClass("is-active");
		$wrap.find(".pd-chart-xlabel").removeClass("is-active");
	}

	$(document).on(
		"mouseenter.pd-chart",
		".pd-chart-wrap .pd-bar-hit, ".concat(
			".pd-chart-wrap .pd-col-hit, ",
			".pd-chart-wrap .pd-chart-bar"
		),
		function (e) {
			show_chart_tip(e, this);
		}
	);

	$(document).on("mousemove.pd-chart", ".pd-chart-wrap", function (e) {
		const $wrap = $(this);
		const $tip = $wrap.find(".pd-chart-tip");
		if ($tip.is(":visible")) {
			position_chart_tip(e, $wrap, $tip);
		}
	});

	$(document).on("mouseleave.pd-chart", ".pd-chart-wrap", function () {
		hide_chart_tip($(this));
	});

	// Mobile / click support
	$(document).on(
		"click.pd-chart",
		".pd-chart-wrap .pd-bar-hit, ".concat(
			".pd-chart-wrap .pd-col-hit, ",
			".pd-chart-wrap .pd-chart-bar"
		),
		function (e) {
			e.stopPropagation();
			show_chart_tip(e, this);
		}
	);

	$(document).on("click.pd-chart-dismiss", function (e) {
		if (!$(e.target).closest(".pd-chart-wrap").length) {
			hide_chart_tip($(".pd-chart-wrap"));
		}
	});

	// Legend hover highlights corresponding series across the chart
	$(document).on("mouseenter.pd-chart", ".pd-chart-wrap .pd-lg-i", function () {
		const $this = $(this);
		const si = $this.attr("data-series-idx");
		if (si !== undefined && si !== null && si !== "") {
			$this.closest(".pd-chart-wrap").attr("data-hover-series", si);
		}
	});

	$(document).on("mouseleave.pd-chart", ".pd-chart-wrap .pd-lg-i", function () {
		$(this).closest(".pd-chart-wrap").removeAttr("data-hover-series");
	});
}

function phase_progress_rows(phases) {
	if (!phases || !phases.length) return pd_empty_note();

	const rows = phases
		.map(
			(p) => `
			<div class="pd-pr-row" title="${frappe.utils.escape_html(p.phase)}: ${flt2(p.percent_complete)}%">
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
		const due_date = m.target_date
			? (frappe.datetime && frappe.datetime.str_to_user ? frappe.datetime.str_to_user(m.target_date) : m.target_date)
			: "—";

		body += `
			<tr>
				<td class="pd-tb-strong">${frappe.utils.escape_html(m.milestone || "")}</td>
				<td class="pd-tb-muted">${due_date}</td>
				<td class="pd-tb-num">${flt2(m.percent_amount)}%</td>
				<td class="pd-tb-num pd-tb-val">${symbol}${fmt_val(m.net_payable)}</td>
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
							<th style="min-width:240px">${__("Milestone")}</th>
							<th style="width:130px">${__("Due")}</th>
							<th class="pd-tb-num" style="width:90px">%</th>
							<th class="pd-tb-num" style="width:140px">${__("Net Payable")}</th>
							<th style="width:140px">${__("Invoice")}</th>
							<th class="pd-tb-center" style="width:110px">${__("Status")}</th>
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
	const chartId = opts.id || "";
	const n = labels.length;
	if (!n) return pd_empty_note();

	const ML = 56,
		MR = 12,
		MT = 16;
	const W = opts.w || 1040;
	const plotW = W - ML - MR;
	const colW = plotW / n;

	// Rotate x-axis labels if columns are narrow or labels are long to prevent overlap
	const rotateLabels = colW < 110 || labels.some((l) => String(l).length > 10);
	const MB = rotateLabels ? 72 : 34;
	const H = opts.h ? Math.max(opts.h, rotateLabels ? 255 : 220) : rotateLabels ? 255 : 230;
	const plotH = H - MT - MB;

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

	const groupW = Math.min(colW * 0.72, 120);
	const barW = Math.max(6, groupW / series.length - 4);
	let colBgSvg = "",
		colHitSvg = "",
		barsSvg = "",
		barHitSvg = "",
		labelsSvg = "";

	for (let i = 0; i < n; i++) {
		const colLeft = ML + i * colW;
		const groupX = ML + (i + 0.5) * colW - groupW / 2;

		// Column hover background (subtle soft highlight behind the bars)
		colBgSvg += `<rect class="pd-col-bg" data-group-idx="${i}" x="${(colLeft + 2).toFixed(1)}" y="${MT.toFixed(
			1
		)}" width="${(colW - 4).toFixed(1)}" height="${plotH.toFixed(1)}" rx="4" style="display:none;"></rect>`;

		// Column hit area (spans full column slot)
		colHitSvg += `<rect class="pd-col-hit" data-chart-id="${chartId}" data-group-idx="${i}" x="${colLeft.toFixed(
			1
		)}" y="${MT.toFixed(1)}" width="${colW.toFixed(1)}" height="${plotH.toFixed(1)}" fill="transparent" style="cursor:pointer;"></rect>`;

		series.forEach((s, si) => {
			const bx = groupX + si * (barW + 4);
			const v = flt(s.values[i]);
			const rawBarH = v * scale;
			const isZero = v <= 0;
			const barH = isZero ? 1.5 : Math.max(rawBarH, 2.5);
			const barY = isZero ? baseY - 1.5 : baseY - barH;
			const zeroClass = isZero ? " pd-chart-bar-zero" : "";
			const zeroAttr = isZero ? ' opacity="0.35"' : "";
			const title = frappe.utils.escape_html(`${labels[i]} — ${s.name}: ${symbol ? symbol + " " : ""}${fmt_val(v)}`);

			barsSvg += `<rect class="pd-chart-bar${zeroClass}" data-chart-id="${chartId}" data-group-idx="${i}" data-series-idx="${si}" x="${bx.toFixed(
				1
			)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(
				1
			)}" fill="${s.color}" rx="${isZero ? 1 : 2}"${zeroAttr}><title>${title}</title></rect>`;

			// Bar-specific hit target: full column height from MT to baseline, with horizontal padding for effortless hover
			barHitSvg += `<rect class="pd-bar-hit" data-chart-id="${chartId}" data-group-idx="${i}" data-series-idx="${si}" x="${(
				bx - 2
			).toFixed(1)}" y="${MT.toFixed(1)}" width="${(barW + 4).toFixed(1)}" height="${plotH.toFixed(
				1
			)}" fill="transparent" style="cursor:pointer;"></rect>`;
		});

		const rawLabel = String(labels[i] || "");
		if (rotateLabels) {
			const maxLen = colW < 60 ? 14 : 18;
			const shortLabel = rawLabel.length > maxLen ? rawLabel.slice(0, maxLen - 1) + "…" : rawLabel;
			const lx = (ML + (i + 0.5) * colW).toFixed(1);
			const ly = (baseY + 10).toFixed(1);
			labelsSvg += `<text class="pd-chart-xlabel pd-col-hit" data-chart-id="${chartId}" data-group-idx="${i}" x="${lx}" y="${ly}" transform="rotate(-35 ${lx} ${ly})" font-size="9.5" fill="${PD_COLOR.mid}" text-anchor="end" style="cursor:pointer;">${frappe.utils.escape_html(
				shortLabel
			)}<title>${frappe.utils.escape_html(rawLabel)}</title></text>`;
		} else {
			const shortLabel = rawLabel.length > 16 ? rawLabel.slice(0, 15) + "…" : rawLabel;
			labelsSvg += `<text class="pd-chart-xlabel pd-col-hit" data-chart-id="${chartId}" data-group-idx="${i}" x="${(
				ML +
				(i + 0.5) * colW
			).toFixed(1)}" y="${(baseY + 16).toFixed(
				1
			)}" font-size="10" fill="${PD_COLOR.mid}" text-anchor="middle" style="cursor:pointer;">${frappe.utils.escape_html(
				shortLabel
			)}<title>${frappe.utils.escape_html(rawLabel)}</title></text>`;
		}
	}

	const legend = series
		.map(
			(s, si) =>
				`<span class="pd-lg-i" data-chart-id="${chartId}" data-series-idx="${si}"><i style="background:${s.color}"></i>${frappe.utils.escape_html(
					s.name
				)}</span>`
		)
		.join("");

	return `
		<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="pd-chart-svg">${colBgSvg}${gridSvg}${colHitSvg}${barsSvg}${barHitSvg}${labelsSvg}</svg>
		<div class="pd-chart-tip" role="tooltip" style="display:none;"></div>
		<div class="pd-legend">${legend}</div>
	`;
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

function project_duration_days(start, end) {
	if (!start || !end) return 0;
	const s = frappe.datetime.str_to_obj(start);
	const e = frappe.datetime.str_to_obj(end);
	const diff = (e - s) / 86400000;
	return diff > 0 ? Math.round(diff) : 0;
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

function fmt_full_val(v) {
	v = flt(v);
	if (typeof format_currency === "function" && pd_currency_code) {
		try {
			const formatted = format_currency(v, pd_currency_code);
			if (formatted) return formatted;
		} catch (e) {}
	}
	const sym = currency_symbol(pd_currency_code);
	const neg = v < 0;
	const absV = Math.abs(v);
	const parts = absV.toFixed(2).split(".");
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const numStr = (neg ? "-" : "") + parts.join(".");
	return sym ? `${sym} ${numStr}` : numStr;
}

// ---------------------------------------------------------------------------
// Styles (design-system.md — injected once, scoped under .pd)
// ---------------------------------------------------------------------------

function ensure_pd_styles() {
	let style = document.getElementById("pd-dashboard-styles");
	if (!style) {
		style = document.createElement("style");
		style.id = "pd-dashboard-styles";
		document.head.appendChild(style);
	}
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
.pd-status-col { transition: background 0.2s ease; }
.pd-k { font-size:9px; font-weight:500; letter-spacing:.16em; text-transform:uppercase; color:${PD_COLOR.ink}; }
.pd-v { font-size:26px; font-weight:600; letter-spacing:-1.1px; color:${PD_COLOR.ink}; margin-top:6px; min-height:34px; display:flex; align-items:center; }
.pd-unit { font-size:14px; font-weight:400; color:${PD_COLOR.mid}; }
.pd-s { font-size:10.5px; color:${PD_COLOR.mid}; margin-top:4px; white-space:nowrap; min-height:20px; overflow:hidden; text-overflow:ellipsis; }
.pd-s.pd-has-tips { overflow:visible !important; white-space:normal; }
.pd-mx-sp { margin-top:auto; padding-top:8px; }

/* Pills */
.pd-pill { display:inline-block; padding:3px 9px; border-radius:5px; font-size:10.5px; font-weight:600; color:#fff; white-space:nowrap; }
.pd-pill-lg { display:inline-flex; align-items:center; gap:6px; padding:5px 13px; border-radius:6px; font-size:15px; font-weight:700; color:#fff; white-space:nowrap; letter-spacing:0.2px; box-shadow:0 1px 3px rgba(0,0,0,0.12); }
.pd-pill-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#fff; opacity:.95; }

/* KPI chips & Date chip */
.pd-kpi-chip { display:inline-flex; align-items:center; gap:4px; font-size:11.5px; font-weight:500; color:${PD_COLOR.ink}; background:rgba(255,255,255,0.85); padding:2px 7px; border-radius:4px; border:1px solid rgba(0,0,0,0.08); transition:background .15s ease, border-color .15s ease; }
.pd-kpi-chip:hover { background:#ffffff; border-color:rgba(0,0,0,0.25); }
.pd-kpi-lbl { font-weight:700; color:${PD_COLOR.mid}; font-size:10px; letter-spacing:.05em; }
.pd-kpi-num { font-weight:700; font-feature-settings:"tnum" 1; }
.pd-info-icon { font-style:normal; font-size:11px; line-height:1; color:${PD_COLOR.mid}; opacity:.75; margin-left:2px; }
.pd-kpi-chip:hover .pd-info-icon, .pd-tip:hover .pd-info-icon { opacity:1; color:${PD_COLOR.ink}; }
.pd-date-chip { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:500; color:${PD_COLOR.ink}; background:rgba(255,255,255,0.85); padding:2px 7px; border-radius:4px; border:1px solid rgba(0,0,0,0.08); }
.pd-date-icon { font-size:10px; opacity:.85; }
.pd-sep { color:${PD_COLOR.soft}; margin:0 1px; }

/* Tooltips */
.pd-tip { position:relative; cursor:help; }
.pd-tip-box { display:none; position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%); width:260px; padding:10px 12px; background:#0f172a; color:#f8fafc; border-radius:6px; font-size:11px; line-height:1.45; font-weight:400; text-transform:none; letter-spacing:normal; white-space:normal; box-shadow:0 10px 25px -5px rgba(0,0,0,0.35), 0 8px 10px -6px rgba(0,0,0,0.2); z-index:99999; pointer-events:none; }
.pd-tip-box::after { content:""; position:absolute; top:100%; left:50%; transform:translateX(-50%); border-width:5px; border-style:solid; border-color:#0f172a transparent transparent transparent; }
.pd-tip:hover .pd-tip-box, .pd-tip.pd-tip-active .pd-tip-box { display:block; }
.pd-tip-left .pd-tip-box { left:0; transform:none; }
.pd-tip-left .pd-tip-box::after { left:20px; transform:none; }
.pd-tip-title { display:block; font-weight:700; font-size:12px; color:#fff; margin-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:4px; }
.pd-tip-formula { display:block; font-family:var(--font-monospace, monospace); font-size:10px; color:#93c5fd; margin-bottom:6px; }
.pd-tip-list { margin:0 0 5px 0; padding-left:14px; list-style-type:disc; }
.pd-tip-list li { margin-bottom:3px; color:#cbd5e1; }
.pd-tip-good { color:#4ade80; font-weight:600; }
.pd-tip-bad { color:#f87171; font-weight:600; }
.pd-tip-desc { display:block; font-size:10px; color:#94a3b8; font-style:italic; border-top:1px solid rgba(255,255,255,0.1); padding-top:4px; }

/* Stage strip */
.pd-stage-sec { margin-top:30px; }
.pd-stage-title { margin-bottom:8px; }
.pd-stage-strip { display:flex; gap:2px; border-radius:8px; overflow:hidden; }
.pd-stage { flex:1; padding:14px 16px; color:#fff; min-width:0; }
.pd-stage-v { font-size:21px; font-weight:600; letter-spacing:-0.6px; }
.pd-stage-l { font-size:10.5px; opacity:.88; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pd-stage-s { font-size:11px; opacity:.85; margin-top:3px; font-weight:500; }
@media (max-width: 640px) {
	.pd-stage-strip { flex-wrap:wrap; }
	.pd-stage { flex:1 1 calc(50% - 2px); }
}

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
.pd-pi-legend i { width:8px; height:8px; display:inline-block; border-radius:2px; border:1px solid rgba(0,0,0,0.08); box-sizing:border-box; }
.pd-pi-list { display:flex; flex-direction:column; gap:10px; }
.pd-pi-row { display:grid; grid-template-columns:150px 1fr; gap:12px; align-items:center; }
.pd-pi-name { font-size:11.5px; color:${PD_COLOR.ink}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pd-pi-tracks { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; }
.pd-pi-track { position:relative; height:14px; border-radius:3px; background:${PD_COLOR.rule2}; overflow:hidden; }
.pd-pi-fill { position:absolute; left:0; top:0; height:100%; border-radius:3px; }
.pd-pi-pct { position:absolute; right:4px; top:0; height:100%; display:flex; align-items:center; font-size:9px; font-weight:600; color:${PD_COLOR.ink}; }

/* Phase progress rows */
.pd-pr-list { display:flex; flex-direction:column; gap:12px; }
.pd-pr-row { display:grid; grid-template-columns:150px 1fr 40px; gap:12px; align-items:center; }
.pd-pr-name { font-size:11.5px; color:${PD_COLOR.ink}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pd-pr-pct { font-size:11px; font-weight:600; color:${PD_COLOR.ink}; text-align:right; }

/* Bar chart legend */
.pd-legend { display:flex; justify-content:center; gap:16px; margin-top:8px; }
.pd-lg-i { font-size:10.5px; color:${PD_COLOR.mid}; display:flex; align-items:center; gap:5px; cursor:pointer; user-select:none; padding:2px 6px; border-radius:4px; transition:background-color .15s ease; }
.pd-lg-i:hover { background:#f1f5f9; }
.pd-lg-i i { width:8px; height:8px; display:inline-block; border-radius:2px; }

/* Grouped bar charts & interactive tooltips */
.pd-chart-wrap { position: relative; width: 100%; }
.pd-chart-svg { display: block; overflow: visible; }
.pd-col-bg { pointer-events: none; fill: rgba(15, 23, 42, 0.04); rx: 4px; }
.pd-chart-bar { cursor: pointer; transition: opacity 0.15s ease, filter 0.15s ease; }
.pd-chart-wrap.has-hover .pd-chart-bar { opacity: 0.45; }
.pd-chart-wrap.has-hover .pd-chart-bar.is-active { opacity: 1 !important; filter: brightness(1.2) drop-shadow(0 2px 5px rgba(0, 0, 0, 0.25)); }
.pd-chart-wrap[data-hover-series] .pd-chart-bar { opacity: 0.25; }
.pd-chart-wrap[data-hover-series="0"] .pd-chart-bar[data-series-idx="0"],
.pd-chart-wrap[data-hover-series="1"] .pd-chart-bar[data-series-idx="1"],
.pd-chart-wrap[data-hover-series="2"] .pd-chart-bar[data-series-idx="2"],
.pd-chart-wrap[data-hover-series="3"] .pd-chart-bar[data-series-idx="3"] { opacity: 1 !important; filter: brightness(1.2) drop-shadow(0 0 3px rgba(0, 0, 0, 0.25)); }
.pd-chart-xlabel { font-family: var(--font-stack); user-select: none; transition: fill 0.15s ease, opacity 0.15s ease; }
.pd-chart-wrap.has-hover .pd-chart-xlabel { opacity: 0.55; }
.pd-chart-wrap.has-hover .pd-chart-xlabel.is-active { opacity: 1 !important; fill: ${PD_COLOR.ink}; font-weight: 600; }

.pd-chart-tip {
	position: absolute;
	pointer-events: none;
	z-index: 9999;
	background: #0f172a;
	color: #f8fafc;
	border-radius: 8px;
	padding: 10px 14px;
	font-size: 11px;
	line-height: 1.4;
	box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.25);
	border: 1px solid rgba(255, 255, 255, 0.12);
	min-width: 210px;
	max-width: 380px;
	white-space: nowrap;
	display: none;
	transform: translate3d(0, 0, 0);
	transition: opacity 0.1s ease;
}
.pd-ct-head { font-size: 11.5px; font-weight: 700; color: #f8fafc; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.12); }
.pd-ct-rows { display: flex; flex-direction: column; gap: 4px; }
.pd-ct-row { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 4px; font-size: 11px; transition: background-color 0.1s ease; }
.pd-ct-row.is-active { background: rgba(255, 255, 255, 0.14); }
.pd-ct-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.pd-ct-name { color: #cbd5e1; margin-right: auto; }
.pd-ct-row.is-active .pd-ct-name { color: #ffffff; font-weight: 600; }
.pd-ct-val { font-weight: 600; color: #ffffff; font-feature-settings: "tnum" 1; }
.pd-ct-row.is-active .pd-ct-val { color: #38bdf8; }
.pd-ct-full { font-size: 10px; color: #94a3b8; font-feature-settings: "tnum" 1; }
.pd-ct-row.is-active .pd-ct-full { color: #cbd5e1; }

/* Table */
.pd-tb-wrap { overflow-x:auto; }
.pd-tb { width:100%; border-collapse:collapse; font-size:12px; min-width:680px; }
.pd-tb th { padding:10px 14px; text-align:left; font-size:9px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:${PD_COLOR.ink}; border-bottom:1px solid ${PD_COLOR.rule}; white-space:nowrap; }
.pd-tb td { padding:11px 14px; border-bottom:1px solid ${PD_COLOR.rule2}; color:${PD_COLOR.ink}; vertical-align:middle; }
.pd-tb tr:last-child td { border-bottom:none; }
.pd-tb tr:hover td { background-color: #f8fafc; }
.pd-tb-strong { font-weight:600; }
.pd-tb-muted { color:${PD_COLOR.mid}; white-space:nowrap; }
.pd-tb th.pd-tb-num, .pd-tb td.pd-tb-num { text-align:right !important; font-feature-settings:"tnum" 1; }
.pd-tb-val { font-weight:600; }
.pd-tb th.pd-tb-center, .pd-tb td.pd-tb-center { text-align:center !important; }
`;
	document.head.appendChild(style);
}
