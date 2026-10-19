# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

"""Helpers the EPCForge reports use to build their header `meta` (the third value
`execute()` returns, read by public/js/epc_report/kit.js).

Header figures are summed from the same rows the report returns to its table.
"""

from collections import OrderedDict

import frappe
from frappe.utils import cint, flt


def meta(**sections):
	"""Header payload in the currency of the user's default company (EPCForge projects
	carry no currency of their own; their company's currency is what amounts are in)."""
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("EPCForge Settings", "default_company")
	currency = (frappe.get_cached_value("Company", company, "default_currency") if company else None) \
		or frappe.db.get_single_value("EPCForge Settings", "default_currency") or frappe.defaults.get_global_default("currency")
	symbol, on_right = (frappe.get_cached_value("Currency", currency, ["symbol", "symbol_on_right"]) if currency else None) or ("", 0)
	return {"epc_header": 1, "currency": {"code": currency, "symbol": symbol or currency or "", "on_right": cint(on_right)}, **sections}


def group(rows, key_of, value_of=lambda r: 0, limit=None):
	"""[{key, value, count}] by key, largest value first (then most rows)."""
	out = OrderedDict()
	for r in rows:
		key = key_of(r)
		if key in (None, ""):
			continue
		g = out.setdefault(key, {"key": key, "value": 0.0, "count": 0})
		g["value"] += flt(value_of(r))
		g["count"] += 1
	ranked = sorted(out.values(), key=lambda g: (-g["value"], -g["count"]))
	return ranked[:limit] if limit else ranked


def total(rows, value_of):
	return sum(flt(value_of(r)) for r in rows)


def pct(part, whole):
	return flt(part) / flt(whole) * 100 if flt(whole) else 0
