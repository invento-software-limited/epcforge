// Larger charts: combo bar+line, donut and a bar sparkline. Widths are
// measured by the caller so the SVG coordinate space matches the card it sits in.
frappe.provide("epcforge.boq_dashboard");

epcforge.boq_dashboard.page_charts = (() => {
	const fmt = epcforge.boq_dashboard.format;
	const esc = fmt.esc;

	// A step from (1, 2, 2.5, 5, 10) × 10^n so at most ~5 gridlines appear.
	function nice_top(max) {
		const raw = max / 4 || 1;
		const mag = Math.pow(10, Math.floor(Math.log10(raw)));
		const step = [1, 2, 2.5, 5, 10].map((n) => n * mag).find((s) => raw <= s) || mag * 10;
		return { step, top: Math.ceil(max / step) * step || step };
	}

	// Axis values in the scale named by the subtitle (lakh / thousand / million).
	function scale_for(max) {
		const south = ["BDT", "INR", "PKR", "NPR", "LKR"].includes(fmt.ccy.code);
		if (south) return max >= 1e7 ? [1e7, "crore"] : [1e5, "lakh"];
		return max >= 1e6 ? [1e6, "million"] : [1e3, "thousand"];
	}

	function grid(top, step, ML, W, MR, y, divisor) {
		let svg = "";
		for (let v = 0; v <= top + 1e-9; v += step) {
			const yy = y(v).toFixed(1);
			const label = +(v / divisor).toFixed(2);
			svg += `<line x1="${ML}" x2="${W - MR}" y1="${yy}" y2="${yy}" stroke="#edf0f3"/>`;
			svg += `<text x="${ML - 8}" y="${(+yy + 3.5).toFixed(1)}" font-size="9.5" fill="#98a1ac" text-anchor="end">${label}</text>`;
		}
		return svg;
	}

	// Category names under narrow columns: the first word, otherwise up to 12 characters.
	const axis_label = (label, col) => {
		const text = String(label || "");
		if (col < 75) return text.split(/[\s&]+/)[0].slice(0, 10);
		return text.length > 12 ? `${text.slice(0, 11)}…` : text;
	};

	function combo(labels, bars, line, W, names = [__("Bars"), __("Line")]) {
		const H = 210, ML = 40, MR = 8, MT = 12, MB = 24;
		const n = labels.length;
		if (!n) return `<div class="empty">${__("No data")}</div>`;
		const max = Math.max(...bars, ...line, 0);
		const [divisor, unit] = scale_for(max);
		const { step, top } = nice_top(max || divisor);
		const y = (v) => MT + (1 - v / top) * (H - MT - MB);
		const col = (W - ML - MR) / n, bw = Math.max(6, Math.min(34, col * 0.55));
		let svg = grid(top, step, ML, W, MR, y, divisor), pts = [], dots = "", xl = "";
		labels.forEach((label, i) => {
			const cx = ML + (i + 0.5) * col;
			svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y(bars[i]).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(bars[i])).toFixed(1)}" fill="#097C52" rx="1.5"><title>${esc(`${label} · ${names[0]}: ${fmt.compact(bars[i])}`)}</title></rect>`;
			pts.push(`${cx.toFixed(1)} ${y(line[i]).toFixed(1)}`);
			dots += `<circle cx="${cx.toFixed(1)}" cy="${y(line[i]).toFixed(1)}" r="2.6" fill="#fff" stroke="#a3552f" stroke-width="1.6"><title>${esc(`${label} · ${names[1]}: ${fmt.compact(line[i])}`)}</title></circle>`;
			if (n <= 14 || i % 2 === 0) xl += `<text x="${cx.toFixed(1)}" y="${H - 7}" font-size="9.5" fill="#98a1ac" text-anchor="middle">${esc(axis_label(label, col))}</text>`;
		});
		svg += `<path d="M ${pts.join(" L ")}" fill="none" stroke="#a3552f" stroke-width="1.6" stroke-linejoin="round"/>${dots}${xl}`;
		return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${svg}</svg>`, unit };
	}

	// parts: [{label, value, color, count}]; total shown in the centre.
	function donut(parts, centre, sub) {
		const R = 52, r = 34, C = 66;
		const total = parts.reduce((s, p) => s + p.value, 0);
		let a0 = -Math.PI / 2, arcs = "";
		parts.forEach((p, i) => {
			const share = total ? p.value / total : 0;
			if (share <= 0) return;
			const a1 = a0 + share * Math.PI * 2 - (share < 1 ? 0.0001 : 0.0002);
			const big = a1 - a0 > Math.PI ? 1 : 0;
			const pt = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)} ${(C + rad * Math.sin(a)).toFixed(2)}`;
			arcs += `<path class="bar-lk" data-i="${i}" d="M ${pt(R, a0)} A ${R} ${R} 0 ${big} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${big} 0 ${pt(r, a0)} Z" fill="${p.color}"><title>${esc(`${p.label}: ${fmt.compact(p.value)} · ${p.count}`)}</title></path>`;
			a0 = a1;
		});
		if (!arcs) arcs = `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="#eef1f4" stroke-width="${R - r}"/>`;
		return `<svg viewBox="0 0 132 132" role="img">${arcs}
			<text x="${C}" y="${C + 2}" font-size="16" font-weight="600" fill="#0d1117" text-anchor="middle">${esc(centre)}</text>
			<text x="${C}" y="${C + 16}" font-size="8.5" fill="#98a1ac" text-anchor="middle">${esc(sub)}</text></svg>`;
	}

	// Bars under a KPI card; width is capped so one bar never fills the slot. With
	// `latest`, every bar but the last is dimmed (recent periods, "now" matters most).
	function bar_sparkline(values, colors, latest) {
		const W = 170, H = 26, gap = 4, n = values.length || 1;
		const bw = Math.min(28, (W - gap * (n + 1)) / n);
		const max = Math.max(...values, 0.0001);
		return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${values.map((v, i) => {
			const h = Math.max((v / max) * (H - 2), 1);
			return `<rect x="${(gap + i * (bw + gap)).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${colors[i]}" opacity="${latest && i < values.length - 1 ? 0.38 : 1}"/>`;
		}).join("")}</svg>`;
	}

	return { combo, donut, bar_sparkline };
})();
