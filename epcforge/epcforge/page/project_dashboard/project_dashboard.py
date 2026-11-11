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

	task_counts = frappe.db.sql(
		"""
		SELECT
			count(*) as total,
			sum(case when status = 'Completed' then 1 else 0 end) as completed
		FROM `tabTask`
		WHERE project = %s
		""",
		project_id,
		as_dict=True,
	)
	if task_counts and task_counts[0]:
		project["total_tasks"] = int(task_counts[0].total or 0)
		project["completed_tasks"] = int(task_counts[0].completed or 0)
	else:
		project["total_tasks"] = 0
		project["completed_tasks"] = 0

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

	procurement = _procurement_coverage(boq)

	return {
		"currency": frappe.db.get_single_value("EPCForge Settings", "default_currency")
		or frappe.defaults.get_global_default("currency"),
		"project": project,
		"budget": budget,
		"boq": _boq_summary(boq),
		"procurement": procurement,
		"cost_by_type": _cost_by_item_type(boq),
		"cost_by_head": get_budget_vs_actual_rows({"project": project_id}),
		"payment_milestones": _payment_milestones(boq),
		"phase_progress": _phase_progress(boq, procurement),
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
			"total_boq_items": 0,
			"total_boq_value": 0.0,
			"total_mr_value": 0.0,
			"total_po_value": 0.0,
			"total_pr_value": 0.0,
			"total_paid_value": 0.0,
			"mr_coverage_pct": 0.0,
			"po_coverage_pct": 0.0,
			"pr_coverage_pct": 0.0,
			"paid_coverage_pct": 0.0,
		},
	}
	if not boq:
		return empty

	items = []
	total_boq_qty = total_boq_value = 0.0
	total_mr_qty = total_po_qty = total_pr_qty = total_paid_qty = 0.0
	total_mr_value = total_po_value = total_pr_value = total_paid_value = 0.0

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
				select coalesce(sum(poi.qty), 0), coalesce(sum(poi.base_amount), 0)
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
				select coalesce(sum(pri.qty), 0), coalesce(sum(pri.base_amount), 0)
				from `tabPurchase Receipt Item` pri
				join `tabPurchase Receipt` pr on pr.name = pri.parent
				where pri.custom_boq_item = %s and pr.docstatus = 1
				""",
				row.name,
			)[0]
		)

		# Paid from submitted Purchase Invoices
		pi_rows = frappe.db.sql(
			"""
			select pii.qty, pii.base_amount, pi.grand_total, pi.outstanding_amount, pi.status
			from `tabPurchase Invoice Item` pii
			join `tabPurchase Invoice` pi on pi.name = pii.parent
			where pi.docstatus = 1
			and (
				pii.custom_boq_item = %s
				or exists (
					select 1 from `tabPurchase Order Item` poi
					where poi.name = pii.po_detail and poi.custom_boq_item = %s
				)
				or exists (
					select 1 from `tabPurchase Receipt Item` pri
					where pri.name = pii.pr_detail and pri.custom_boq_item = %s
				)
			)
			""",
			(row.name, row.name, row.name),
			as_dict=True,
		)

		paid_qty = 0.0
		paid_value = 0.0
		for pi_r in pi_rows:
			gt = flt(pi_r.grand_total)
			out = flt(pi_r.outstanding_amount)
			if pi_r.status == "Paid" or out <= 0:
				frac = 1.0
			elif gt > 0:
				frac = min(max((gt - max(out, 0.0)) / gt, 0.0), 1.0)
			else:
				frac = 0.0
			paid_qty += flt(pi_r.qty) * frac
			paid_value += flt(pi_r.base_amount) * frac

		# If no PI exists for this item yet, check advance paid directly on linked PO
		if not pi_rows:
			po_advances = frappe.db.sql(
				"""
				select poi.qty, poi.base_amount, po.grand_total, po.advance_paid
				from `tabPurchase Order Item` poi
				join `tabPurchase Order` po on po.name = poi.parent
				where poi.custom_boq_item = %s and po.docstatus = 1 and po.advance_paid > 0
				""",
				row.name,
				as_dict=True,
			)
			for po_r in po_advances:
				gt = flt(po_r.grand_total)
				adv = flt(po_r.advance_paid)
				if gt > 0:
					frac = min(max(adv / gt, 0.0), 1.0)
					paid_qty += flt(po_r.qty) * frac
					paid_value += flt(po_r.base_amount) * frac

		items.append(
			{
				"boq_item": row.name,
				"item_code": row.boq_code,
				"description": row.description or row.boq_code,
				"group": row.group,
				"uom": row.uom or "",
				"boq_qty": qty,
				"mr_qty": mr_qty,
				"po_qty": po_qty,
				"pr_qty": pr_qty,
				"paid_qty": paid_qty,
				"mr_pct": min(round(mr_qty / qty * 100, 1), 100) if qty else 0,
				"po_pct": min(round(po_qty / qty * 100, 1), 100) if qty else 0,
				"pr_pct": min(round(pr_qty / qty * 100, 1), 100) if qty else 0,
				"paid_pct": min(round(paid_qty / qty * 100, 1), 100) if qty else 0,
			}
		)

		total_boq_qty += qty
		total_boq_value += boq_value
		total_mr_qty += mr_qty
		total_mr_value += min(mr_qty, qty) * rate
		total_po_qty += po_qty
		total_pr_qty += pr_qty
		total_paid_qty += paid_qty
		total_po_value += po_value
		total_pr_value += pr_value
		total_paid_value += paid_value

	kpis = {
		"total_items": len(items),
		"total_boq_items": len(boq.boq_items),
		"total_boq_value": total_boq_value,
		"total_mr_value": total_mr_value,
		"total_po_value": total_po_value,
		"total_pr_value": total_pr_value,
		"total_paid_value": total_paid_value,
		"mr_coverage_pct": round(total_mr_qty / total_boq_qty * 100, 1) if total_boq_qty else 0,
		"po_coverage_pct": round(total_po_qty / total_boq_qty * 100, 1) if total_boq_qty else 0,
		"pr_coverage_pct": round(total_pr_qty / total_boq_qty * 100, 1) if total_boq_qty else 0,
		"paid_coverage_pct": round(total_paid_qty / total_boq_qty * 100, 1) if total_boq_qty else 0,
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


def _phase_progress(boq, procurement=None):
	phases = {}
	if not boq:
		return []

	proc_item_progress = {}
	if procurement and procurement.get("items"):
		for it in procurement["items"]:
			pct = flt(it.get("pr_pct", 0.0))
			if it.get("boq_item"):
				proc_item_progress[it["boq_item"]] = pct
			if it.get("item_code"):
				proc_item_progress[it["item_code"]] = pct

	for row in boq.boq_items:
		phase = row.phase or "Unspecified"
		bucket = phases.setdefault(
			phase, {"amount": 0.0, "weighted_progress": 0.0, "count": 0, "total_progress": 0.0}
		)
		amt = flt(row.amount)
		bucket["amount"] += amt
		bucket["count"] += 1

		prog = flt(row.percent_complete)
		# For Material items or rows in the Procurement phase where percent_complete is 0,
		# use the actual Goods Received (Purchase Receipt) progress
		if not prog and (row.item_type == "Material" or phase == "Procurement"):
			if row.name in proc_item_progress:
				prog = proc_item_progress[row.name]
			elif row.boq_code in proc_item_progress:
				prog = proc_item_progress[row.boq_code]
			elif row.qty:
				pr_qty = flt(
					frappe.db.sql(
						"""
						select coalesce(sum(pri.qty), 0)
						from `tabPurchase Receipt Item` pri
						join `tabPurchase Receipt` pr on pr.name = pri.parent
						where pri.custom_boq_item = %s and pr.docstatus = 1
						""",
						row.name,
					)[0][0]
				)
				prog = min(100.0, max(0.0, round((pr_qty / flt(row.qty)) * 100.0, 1)))

		bucket["weighted_progress"] += amt * prog
		bucket["total_progress"] += prog

	result = []
	for phase, b in phases.items():
		if b["amount"] > 0:
			pct = round(b["weighted_progress"] / b["amount"], 1)
		elif b["count"] > 0:
			pct = round(b["total_progress"] / b["count"], 1)
		else:
			pct = 0.0
		result.append({"phase": phase, "percent_complete": pct, "amount": b["amount"]})
	return result
