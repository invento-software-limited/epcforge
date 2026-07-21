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
}

# Permissions
# -----------
permission_query_conditions = {"*": "epcforge.utils.get_project_query_conditions"}

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
