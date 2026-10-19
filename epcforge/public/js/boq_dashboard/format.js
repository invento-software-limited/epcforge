// Number, currency and date formatting for the BOQ dashboard.
// The currency is the project company's, set once per render via use_currency().
frappe.provide("epcforge.boq_dashboard");

epcforge.boq_dashboard.format = (() => {
	const SOUTH_ASIAN = ["BDT", "INR", "PKR", "NPR", "LKR"];
	const ccy = { code: "", symbol: "", on_right: false };

	const use_currency = (code, symbol, on_right) => {
		ccy.code = code || "";
		ccy.symbol = symbol || code || "";
		ccy.on_right = !!on_right;
	};

	const south_asian = () => SOUTH_ASIAN.includes(ccy.code);

	// Lakh/crore grouping for South Asian currencies, thousands grouping otherwise.
	const grouped = (n, decimals = 0) => {
		const neg = n < 0;
		const [whole, frac] = Math.abs(n || 0).toFixed(decimals).split(".");
		let s = whole;
		if (south_asian() && s.length > 3) {
			s = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + s.slice(-3);
		} else {
			s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}
		return (neg ? "-" : "") + s + (frac ? "." + frac : "");
	};

	const compact_parts = (n) => {
		const abs = Math.abs(n || 0);
		const sign = n < 0 ? "-" : "";
		const steps = south_asian()
			? [[1e7, 2, "Cr"], [1e5, 1, "L"]]
			: [[1e9, 2, "B"], [1e6, 2, "M"], [1e3, 1, "K"]];
		for (const [size, decimals, unit] of steps) {
			if (abs >= size) return { number: sign + (abs / size).toFixed(decimals), unit };
		}
		return { number: sign + grouped(abs), unit: "" };
	};

	const with_symbol = (number, unit) => {
		const body = unit ? `${number} ${unit}` : number;
		return ccy.on_right ? `${body} ${ccy.symbol}` : `${ccy.symbol} ${body}`;
	};

	const compact = (n) => {
		const { number, unit } = compact_parts(n);
		return with_symbol(number, unit);
	};

	const full = (n) => with_symbol(grouped(n, 2), "");

	// Big metric value: number as text, the unit in a lighter trailing <span>.
	const set_compact = (el, n) => {
		if (!el) return;
		const { number, unit } = compact_parts(n);
		el.textContent = ccy.on_right ? number : `${ccy.symbol} ${number}`;
		const span = document.createElement("span");
		span.textContent = ccy.on_right ? `${unit} ${ccy.symbol}`.trim() : unit;
		if (span.textContent) el.appendChild(span);
	};

	const pct = (n, decimals = 1) => (n == null || isNaN(n) ? "—" : `${Number(n).toFixed(decimals)}%`);

	const qty = (n) => grouped(n, Number.isInteger(Math.round((n || 0) * 1000) / 1000) ? 0 : 2);

	const date = (iso, with_year = true) =>
		iso
			? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
					day: "numeric",
					month: "short",
					...(with_year ? { year: "numeric" } : {}),
			  })
			: "—";

	const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));

	// Run `fn` with another currency active (e.g. company currency for landed cost), then restore.
	const in_currency = (code, symbol, on_right, fn) => {
		const saved = { ...ccy };
		use_currency(code, symbol, on_right);
		try {
			return fn();
		} finally {
			Object.assign(ccy, saved);
		}
	};

	// "USD 61,350.00": a fully grouped amount labelled with its own currency code.
	const full_code = (n, code) => in_currency(code, code, false, () => full(n));

	return { use_currency, in_currency, compact, full, full_code, set_compact, pct, qty, date, esc, ccy };
})();
