# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from epcforge.epcforge.report.budget_vs_actual.budget_vs_actual import get_data as get_budget_vs_actual_rows


@frappe.whitelist()
def get_projects_list():
	"""All projects, with the session's active project flagged."""
	all_projects = frappe.get_all(
		"Project", fields=["name", "project_name", "status", "percent_complete"], ignore_permissions=True
	)

	active_project = frappe.defaults.get_user_default("project")
	if not active_project and all_projects:
		active_project = all_projects[0].name
		frappe.defaults.set_user_default("project", active_project)

	return [
		{
			"value": p.name,
			"label": p.project_name or p.name,
			"status": p.status or "Open",
			"percent_complete": flt(p.percent_complete),
			"is_active": p.name == active_project,
		}
		for p in all_projects
	]


@frappe.whitelist()
def get_dashboard_data(project_id: str):
	"""Everything the single-project dashboard renders, in one call."""
	project = frappe.db.get_value(
		"Project",
		project_id,
		[
			"project_name",
			"status",
			"percent_complete",
			"expected_start_date",
			"expected_end_date",
			"customer",
		],
		as_dict=True,
	)
	if not project:
		frappe.throw(_("Project {0} not found").format(project_id))

	frappe.defaults.set_user_default("project", project_id)

	budget = frappe.db.get_value(
		"Project Budget",
		{"project": project_id},
		[
			"name",
			"contract_value",
			"approved_budget",
			"committed_amount",
			"actual_cost",
			"percent_used",
			"remaining_budget",
			"cost_variance",
			"cpi",
			"epc_spi",
			"eac",
			"epc_health",
			"epc_sched_status",
		],
		as_dict=True,
	)

	boq_name = frappe.db.get_value("BOQ", {"project": project_id, "docstatus": ["!=", 2]}, "name")
	boq = frappe.get_doc("BOQ", boq_name) if boq_name else None

	return {
		"currency": frappe.db.get_single_value("EPCForge Settings", "default_currency")
		or frappe.defaults.get_global_default("currency"),
		"project": project,
		"budget": budget,
		"boq": _boq_summary(boq),
		"procurement": _procurement_coverage(boq),
		"cost_by_type": _cost_by_item_type(boq),
		"cost_by_head": get_budget_vs_actual_rows({"project": project_id}),
		"payment_milestones": _payment_milestones(boq),
		"phase_progress": _phase_progress(boq),
	}


def _boq_summary(boq):
	if not boq:
		return None
	return {
		"name": boq.name,
		"status": boq.status,
		"total_amount": flt(boq.total_amount),
		"estimated_cost": flt(boq.estimated_cost),
		"actual_cost": flt(boq.actual_cost),
		"gross_margin_pct": flt(boq.gross_margin_pct),
		"budget_variance": flt(boq.budget_variance),
	}


def _procurement_coverage(boq):
	empty = {
		"items": [],
		"kpis": {
			"total_items": 0,
			"total_boq_value": 0.0,
			"total_po_value": 0.0,
			"total_pr_value": 0.0,
			"mr_coverage_pct": 0.0,
			"po_coverage_pct": 0.0,
			"pr_coverage_pct": 0.0,
		},
	}
	if not boq:
		return empty

	items = []
	total_boq_qty = total_boq_value = 0.0
	total_mr_qty = total_po_qty = total_pr_qty = 0.0
	total_po_value = total_pr_value = 0.0

	for row in boq.boq_items:
		if row.item_type != "Material" or not row.boq_code:
			continue
		if not frappe.db.get_value("Item", row.boq_code, "is_stock_item"):
			continue

		qty = flt(row.qty)
		rate = flt(row.rate)
		boq_value = qty * rate

		mr_qty = flt(
			frappe.db.sql(
				"""
				select coalesce(sum(mri.qty), 0)
				from `tabMaterial Request Item` mri
				join `tabMaterial Request` mr on mr.name = mri.parent
				where mri.custom_boq_item = %s and mr.docstatus != 2
				""",
				row.name,
			)[0][0]
		)

		po_qty, po_value = (
			flt(x)
			for x in frappe.db.sql(
				"""
				select coalesce(sum(poi.qty), 0), coalesce(sum(poi.amount), 0)
				from `tabPurchase Order Item` poi
				join `tabPurchase Order` po on po.name = poi.parent
				where poi.custom_boq_item = %s and po.docstatus = 1
				""",
				row.name,
			)[0]
		)

		pr_qty, pr_value = (
			flt(x)
			for x in frappe.db.sql(
				"""
				select coalesce(sum(pri.qty), 0), coalesce(sum(pri.amount), 0)
				from `tabPurchase Receipt Item` pri
				join `tabPurchase Receipt` pr on pr.name = pri.parent
				where pri.custom_boq_item = %s and pr.docstatus = 1
				""",
				row.name,
			)[0]
		)

		items.append(
			{
				"item_code": row.boq_code,
				"description": row.description or row.boq_code,
				"group": row.group,
				"uom": row.uom or "",
				"boq_qty": qty,
				"mr_qty": mr_qty,
				"po_qty": po_qty,
				"pr_qty": pr_qty,
				"mr_pct": min(round(mr_qty / qty * 100, 1), 100) if qty else 0,
				"po_pct": min(round(po_qty / qty * 100, 1), 100) if qty else 0,
				"pr_pct": min(round(pr_qty / qty * 100, 1), 100) if qty else 0,
			}
		)

		total_boq_qty += qty
		total_boq_value += boq_value
		total_mr_qty += mr_qty
		total_po_qty += po_qty
		total_pr_qty += pr_qty
		total_po_value += po_value
		total_pr_value += pr_value

	kpis = {
		"total_items": len(items),
		"total_boq_items": len(boq.boq_items),
		"total_boq_value": total_boq_value,
		"total_po_value": total_po_value,
		"total_pr_value": total_pr_value,
		"mr_coverage_pct": round(total_mr_qty / total_boq_qty * 100, 1) if total_boq_qty else 0,
		"po_coverage_pct": round(total_po_qty / total_boq_qty * 100, 1) if total_boq_qty else 0,
		"pr_coverage_pct": round(total_pr_qty / total_boq_qty * 100, 1) if total_boq_qty else 0,
	}
	return {"items": items, "kpis": kpis}


def _cost_by_item_type(boq):
	types = {}
	if not boq:
		return types
	for row in boq.boq_items:
		t = row.item_type or "Material"
		bucket = types.setdefault(t, {"contract_value": 0.0, "estimated_cost": 0.0, "actual_cost": 0.0})
		bucket["contract_value"] += flt(row.amount)
		bucket["estimated_cost"] += flt(row.estimated_cost)
		bucket["actual_cost"] += flt(row.actual_cost)
	return types


def _payment_milestones(boq):
	rows = []
	kpis = {"pending": 0.0, "invoiced": 0.0, "received": 0.0}
	if not boq:
		return {"rows": rows, "kpis": kpis}

	for r in boq.get("boq_payment_schedule") or []:
		status = r.payment_status or "Pending"
		rows.append(
			{
				"milestone": r.milestone,
				"linked_wbs": r.linked_wbs,
				"target_date": str(r.target_date) if r.target_date else "",
				"percent_amount": flt(r.percent_amount),
				"amount": flt(r.amount),
				"net_payable": flt(r.net_payable),
				"sales_invoice": r.sales_invoice,
				"payment_status": status,
			}
		)
		key = status.lower()
		if key in kpis:
			kpis[key] += flt(r.net_payable) or flt(r.amount)

	return {"rows": rows, "kpis": kpis}


def _phase_progress(boq):
	phases = {}
	if not boq:
		return []

	for row in boq.boq_items:
		phase = row.phase or "Unspecified"
		bucket = phases.setdefault(phase, {"amount": 0.0, "weighted_progress": 0.0})
		amt = flt(row.amount)
		bucket["amount"] += amt
		bucket["weighted_progress"] += amt * flt(row.percent_complete)

	result = []
	for phase, b in phases.items():
		pct = round(b["weighted_progress"] / b["amount"], 1) if b["amount"] else 0.0
		result.append({"phase": phase, "percent_complete": pct, "amount": b["amount"]})
	return result
