// Inline-SVG mini-visuals and the schedule timeline for the BOQ dashboard.
frappe.provide("epcforge.boq_dashboard");

epcforge.boq_dashboard.charts = (() => {
	const fmt = epcforge.boq_dashboard.format;
	const DAY = 86400000;
	const to_ms = (iso) => new Date(iso + "T00:00:00").getTime();
	const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

	// Progress against a target, with an optional marker (e.g. time elapsed).
	function gauge(fill_pct, color, labels, marker_pct, title) {
		const marker = marker_pct == null ? "" : `<div class="pg-m" style="left:calc(${clamp(marker_pct)}% - 1px)"></div>`;
		return `<div class="pg" title="${fmt.esc(title || "")}">
			<div class="pg-t"><div class="pg-f" style="width:${clamp(fill_pct)}%;background:${color}"></div>${marker}</div>
			<div class="pg-l"><span>${fmt.esc(labels[0])}</span><span>${fmt.esc(labels[1])}</span></div>
		</div>`;
	}

	// One bar split into named parts; each part is {label, value, color}. The legend can be
	// left off when the caller lists the parts itself.
	function segmented(parts, with_legend = true) {
		const total = parts.reduce((s, p) => s + Math.max(p.value, 0), 0) || 1;
		const bar = parts
			.filter((p) => p.value > 0)
			.map((p) => `<i style="width:${((p.value / total) * 100).toFixed(2)}%;background:${p.color}" title="${fmt.esc(`${p.label}: ${fmt.compact(p.value)}`)}"></i>`)
			.join("");
		const legend = parts.map((p) => `<span><i style="background:${p.color}"></i>${fmt.esc(p.label)}</span>`).join("");
		return `<div class="sg-b">${bar}</div>${with_legend ? `<div class="sg-l">${legend}</div>` : ""}`;
	}

	// A date axis from `start` to `end` with today marked; `marks` are labelled vertical lines
	// {date, label, color, above, dash} and `events` are dots {date, color, above, title}.
	function timeline({ start, end, today, marks = [], events = [] }) {
		if (!start || !end) return `<div class="empty">${__("Set the project's start and end dates to see the schedule.")}</div>`;
		const dots = events.filter((e) => e.date);
		const ends = [end, today, ...dots.map((e) => e.date)].map(to_ms);
		const t0 = Math.min(to_ms(start), ...ends), t1 = Math.max(...ends);
		const W = 400, L = 10, R = W - 10, TY = 62;
		const x = (iso) => L + ((to_ms(iso) - t0) / (t1 - t0 || DAY)) * (R - L);
		const now = Math.min(to_ms(today), to_ms(end));
		const elapsed_end = now < to_ms(start) ? x(start) : L + ((now - t0) / (t1 - t0 || DAY)) * (R - L);
		const anchor = (px) => (px < L + 40 ? "start" : px > R - 40 ? "end" : "middle");
		let svg = `<rect x="${x(start).toFixed(1)}" y="${TY - 4}" width="${(x(end) - x(start)).toFixed(1)}" height="8" rx="4" fill="#eef1f4"/>`;
		svg += `<rect x="${x(start).toFixed(1)}" y="${TY - 4}" width="${Math.max(elapsed_end - x(start), 0).toFixed(1)}" height="8" rx="4" fill="#17626e" fill-opacity=".55"><title>${fmt.esc(__("Time elapsed"))}</title></rect>`;
		if (to_ms(today) > to_ms(end)) {
			svg += `<line x1="${x(end).toFixed(1)}" x2="${x(today).toFixed(1)}" y1="${TY}" y2="${TY}" stroke="#a3302f" stroke-width="1.6" stroke-dasharray="3 3"><title>${fmt.esc(__("Past planned finish"))}</title></line>`;
		}
		const all = [...marks, { date: today, label: __("Today"), color: "#0d1117", above: true }]
			.filter((m) => m.date).map((m) => ({ ...m, px: x(m.date), anchor: anchor(x(m.date)) }));
		// Labels sharing a row and closer than ~80 units split apart: left ends at its line, right starts at it.
		[true, false].forEach((row) => {
			const same = all.filter((m) => !!m.above === row).sort((a, b) => a.px - b.px);
			same.slice(1).forEach((m, i) => {
				if (m.px - same[i].px < 80) {
					same[i].anchor = "end";
					m.anchor = "start";
				}
			});
		});
		all.forEach((m) => {
			const px = m.px.toFixed(1), ty = m.above ? TY - 38 : TY + 34;
			const tx = m.anchor === "end" ? (m.px - 3).toFixed(1) : m.anchor === "start" ? (m.px + 3).toFixed(1) : px;
			svg += `<line x1="${px}" x2="${px}" y1="${TY - 20}" y2="${TY + 20}" stroke="${m.color}" stroke-width="1.4" ${m.dash ? 'stroke-dasharray="3 2"' : ""}/>
				<text x="${tx}" y="${ty}" font-size="10" font-weight="600" fill="${m.color}" text-anchor="${m.anchor}">${fmt.esc(m.label)}</text>
				<text x="${tx}" y="${ty + 12}" font-size="9.5" fill="#5c6672" text-anchor="${m.anchor}">${fmt.esc(fmt.date(m.date))}</text>`;
		});
		dots.forEach((e) => {
			svg += `<circle cx="${x(e.date).toFixed(1)}" cy="${e.above ? TY - 9 : TY + 9}" r="4" fill="${e.color}" stroke="#fff" stroke-width="1.5"><title>${fmt.esc(e.title)}</title></circle>`;
		});
		return `<svg viewBox="0 0 ${W} 124" width="100%" height="124" role="img" aria-label="${fmt.esc(__("Project schedule"))}">${svg}</svg>`;
	}

	return { gauge, segmented, timeline };
})();
