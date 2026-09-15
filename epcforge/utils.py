# Copyright (c) 2026, Invento Software Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def after_migrate():
	"""Called after migrating the app"""
	create_default_boq_groups()
	create_default_budget_cost_heads()


def create_default_boq_groups():
	"""Seed default BOQ groups if none exist"""
	if frappe.db.count("BOQ Group") > 0:
		return

	groups = [
		{"name": "Engineering & Design", "is_group": 1},
		{"name": "Civil & Structural Works", "is_group": 1},
		{"name": "Mechanical Works", "is_group": 1},
		{"name": "Electrical Works", "is_group": 1},
		{"name": "Instrumentation & Control", "is_group": 1},
		{"name": "Piping Works", "is_group": 1},
		{"name": "HVAC Works", "is_group": 1},
		{"name": "Telecom & IT", "is_group": 1},
		{"name": "Testing & Commissioning", "is_group": 1},
		{"name": "Project Management & Administration", "is_group": 1},
	]

	for group in groups:
		if not frappe.db.exists("BOQ Group", group["name"]):
			doc = frappe.new_doc("BOQ Group")
			doc.boq_group_name = group["name"]
			doc.is_group = group["is_group"]
			doc.insert(ignore_permissions=True)

	# Commit seeded BOQ groups after migration setup
	frappe.db.commit()  # nosemgrep: frappe-manual-commit


def create_default_budget_cost_heads():
	"""Seed default budget cost heads if none exist"""
	if frappe.db.count("Budget Cost Head") > 0:
		return

	heads = [
		{"name": "Direct Materials", "is_group": 1},
		{"name": "Labour & Manpower", "is_group": 1},
		{"name": "Equipment & Machinery", "is_group": 1},
		{"name": "Subcontract", "is_group": 1},
		{"name": "Overheads", "is_group": 1},
		{"name": "Contingency", "is_group": 0},
	]

	for head in heads:
		if not frappe.db.exists("Budget Cost Head", head["name"]):
			doc = frappe.new_doc("Budget Cost Head")
			doc.cost_head_name = head["name"]
			doc.is_group = head["is_group"]
			doc.insert(ignore_permissions=True)

	# Commit seeded budget cost heads after migration setup
	frappe.db.commit()  # nosemgrep: frappe-manual-commit


def create_boq_from_project_template(doc, method=None):
	"""When a Project is created from a Project Template that carries BOQ Item rows,
	auto-create a matching Draft BOQ for the new project.
	"""
	if not doc.project_template:
		return

	if frappe.db.exists("BOQ", {"project": doc.name, "docstatus": ["!=", 2]}):
		return

	template = frappe.get_doc("Project Template", doc.project_template)
	if not template.get("custom_boq_item"):
		return

	boq = frappe.new_doc("BOQ")
	boq.naming_series = "BOQ-.YYYY.-.#####"
	boq.project = doc.name

	for item in template.custom_boq_item:
		boq.append(
			"boq_items",
			{
				"boq_code": item.boq_code,
				"description": item.description,
				"group": item.group,
				"phase": item.phase,
				"item_type": item.item_type,
				"linked_wbs": _find_project_task(doc.name, item.linked_wbs),
				"qty": item.qty,
				"uom": item.uom,
				"rate": item.rate,
				"estimated_cost": item.estimated_cost,
			},
		)

	if boq.get("boq_items"):
		try:
			boq.insert(ignore_permissions=True)
		except Exception:
			frappe.log_error(
				title="Project Template BOQ Creation Error",
				message=frappe.get_traceback(),
			)


@frappe.whitelist()
def get_active_project():
	"""Get the user's active project (sidebar switcher) from session defaults."""
	active_project = frappe.defaults.get_user_default("project")
	if not active_project:
		return None
	try:
		project = frappe.get_doc("Project", active_project)
	except frappe.DoesNotExistError:
		return None
	return {"name": project.name, "title": project.project_name, "status": project.status or "Open"}


@frappe.whitelist()
def set_active_project(project_id: str):
	"""Set the user's active project (sidebar switcher) session default."""
	if project_id:
		frappe.defaults.set_user_default("project", project_id)
	return {"status": "success"}


def update_session_default_project(doc, method=None):
	"""On Project creation, make it the user's active project - so a freshly
	created project is immediately what New BOQ/Tender/etc. default to."""
	if doc.name:
		frappe.defaults.set_user_default("project", doc.name)


# Doctypes never scoped by the active-project sidebar filter, even when
# browsing inside EPCForge - system/auth/meta doctypes have no business
# being project-filtered.
_PROJECT_FILTER_SKIP_DOCTYPES = frozenset(
	{
		"User",
		"Role",
		"Module Def",
		"Report",
		"Page",
		"DocType",
		"Property Setter",
		"Custom Field",
		"Client Script",
		"Server Script",
		"Workspace",
		"Workspace Sidebar",
		"DefaultValue",
		"User Permission",
		"ToDo",
		"Activity Log",
		"Email Queue",
		"Notification Log",
		"Communication",
		"File",
		"Translation",
		"Scheduled Job Type",
	}
)


def get_project_query_conditions(user, doctype=None):
	"""Global permission_query_conditions hook. Scopes list views to the
	user's active project, but only while browsing inside EPCForge's own
	sidebar (signalled by the X-Epc-Active request header set by
	public/js/sidebar.js) - never applies elsewhere in the Desk.
	"""
	if not doctype or doctype in _PROJECT_FILTER_SKIP_DOCTYPES:
		return ""
	if not frappe.request or frappe.request.headers.get("X-Epc-Active") != "1":
		return ""

	project = frappe.defaults.get_user_default("project")
	if not project:
		return ""

	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return ""
	if meta.issingle or meta.istable:
		return ""

	fieldnames = {df.fieldname for df in meta.fields}
	if "project" not in fieldnames:
		return ""

	return f"`tab{doctype}`.`project` = {frappe.db.escape(project)}"


def _find_project_task(project, template_task):
	"""Map a Project Template's Task row to the Task actually created for this
	project (Frappe copies template tasks via the `template_task` back-reference).
	"""
	if not template_task:
		return None

	new_task = frappe.get_all("Task", filters={"project": project, "template_task": template_task}, limit=1)
	if new_task:
		return new_task[0].name

	subject = frappe.db.get_value("Task", template_task, "subject")
	if subject:
		new_task = frappe.get_all("Task", filters={"project": project, "subject": subject}, limit=1)
		if new_task:
			return new_task[0].name

	return None
