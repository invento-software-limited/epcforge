app_name = "epcforge"
app_title = "EPCForge"
app_publisher = "Invento Software Limited"
app_description = "EPC Operations, BOQ & Budget Management"
app_email = "hello@invento.com.bd"
app_license = "mit"
app_logo_url = "/assets/epcforge/img/epcforge-logo.svg"

from . import __version__ as app_version

# Apps
# ------------------
required_apps = ["erpnext"]

# Each item in the list will be shown as an app in the apps page
add_to_apps_screen = [
	{
		"name": "epcforge",
		"logo": "/assets/epcforge/img/epcforge-logo.svg",
		"title": "EPCForge",
		"route": "/epcforge",
	}
]

# include js in doctype views
doctype_js = {
	"Project": "public/js/project.js",
	"Task": "public/js/task.js",
	"BOQ": "public/js/boq.js",
	"Project Budget": "public/js/project_budget.js",
}

# include js, css files in header of desk.html
app_include_js = ["epcforge.bundle.js"]
app_include_css = ["epcforge.bundle.css"]

# Permissions
# -----------
permission_query_conditions = {"*": "epcforge.utils.get_project_query_conditions"}

# Document Events
# ---------------
doc_events = {
	"Purchase Order": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_order_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_order_update",
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_order_update",
	},
	"Purchase Invoice": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_invoice_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_invoice_update",
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_invoice_update",
	},
	"Purchase Receipt": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_receipt_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_purchase_receipt_update",
	},
	"Stock Entry": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_stock_entry_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_stock_entry_update",
	},
	"Timesheet": {
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_timesheet_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_timesheet_update",
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_timesheet_update",
	},
	"Project": {
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_project_update",
		"after_insert": [
			"epcforge.utils.update_session_default_project",
			"epcforge.utils.create_boq_from_project_template",
		],
	},
	"Task": {
		"on_update": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_task_update",
	},
	"Sales Invoice": {
		"before_insert": "epcforge.epcforge.doctype.project_budget.budget_hooks.set_boq_link",
		"validate": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_sales_invoice_validate",
		"on_submit": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_sales_invoice_update",
		"on_cancel": "epcforge.epcforge.doctype.project_budget.budget_hooks.on_sales_invoice_update",
	},
}

# Installation
# ------------
after_migrate = ["epcforge.utils.after_migrate"]

# Scheduled Tasks
# ---------------
# scheduler_events = {
# 	"daily": [
# 		"epcforge.tasks.daily"
# 	],
# }

# Fixtures
# ---------------
fixtures = ["Session Default Settings"]

# Standard Reports
# ---------------
reports = ["epcforge.epcforge.report.tender_summary.tender_summary"]

# Toolbar
# ---------------
website_context = {
	"favicon": "/assets/epcforge/img/favicon.svg",
	"splash_image": "/assets/epcforge/img/splash.svg",
}
