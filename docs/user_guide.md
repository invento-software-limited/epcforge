# User Guide

## Installation

Install the app using the Frappe Bench CLI:

```bash
# Navigate to your bench directory
cd /path/to/your/bench

# Get the app
bench get-app https://github.com/invento-software-limited//epcforge

# Install on your site
bench --site your-site.com install-app epcforge

# Build assets and migrate
bench build
bench migrate
```

### Prerequisites

- Frappe Bench v14+ / v15+ / v16+
- ERPNext v14+ / v15+ / v16+
- Python 3.10+

---

## Core Workflows

### Step 1: Creating a Bill of Quantities (BOQ)

1. Open **ERPNext Desk** and navigate to **Projects** → **Project**.
2. Select or create your project.
3. Click the **EPCForge** action button at the top right and select **New BOQ**.
4. Add sections and line items with descriptions, quantities, unit rates, and target margin percentages.
5. Save and Submit the BOQ to lock the baseline.

### Step 2: Setting Up Project Budget & Cost Control

1. From the Project form, select **EPCForge** → **Create Budget**.
2. Link budget items to BOQ sections or assign custom cost heads.
3. Enter planned allocations for Material, Labor, Equipment, and Subcontractor expenses.
4. Monitor variance as Purchase Orders and Material Requests are created against the project.

| Field | Description |
|---|---|
| **Project** | The linked ERPNext Project master |
| **BOQ Reference** | Link to the approved BOQ baseline |
| **Target Amount** | Total planned cost allocated for the budget head |
| **Actual Spent** | System-calculated actual expenditures from GL entries |
| **Variance** | Target Amount minus Actual Spent |

### Step 3: Tender & Bidder Management

1. Go to **EPCForge** → **Tenders** and click **New Tender**.
2. Select the Tender Type (Open, Selective, Negotiated, or Single Source).
3. Add invited suppliers in the **Bidders** table.
4. Enter submitted bid values, evaluation scores, and award status.
5. Generate the **Tender Summary Report** for executive review.

---

## Managing Documents

### Registering Engineering Documents

1. Navigate to **EPCForge** → **Document Register**.
2. Upload the engineering document file (Drawing, Spec, Submittal).
3. Assign Document Category, Revision Number, and Assigned User/Party.
4. Move document through workflow states: `Draft` → `Under Review` → `Approved`.

---

## Troubleshooting

| Issue | Possible Cause | Solution |
|---|---|---|
| EPCForge actions missing on Project form | Custom scripts not loaded or site cache outdated | Run `bench --site [site] clear-cache` and reload browser. |
| BOQ total calculation mismatch | Pending recalculation after line item updates | Save document to trigger automatic child table script recalculation. |
| Permission denied for Document Register | User missing EPCForge Engineer or Project Manager role | Assign appropriate EPCForge role in User master. |

---

## FAQ

**Q: Can EPCForge be used without ERPNext?**  
A: EPCForge requires ERPNext as it directly integrates with standard Project, Task, and Supplier masters.

**Q: Does EPCForge support multi-currency projects?**  
A: Yes, BOQs and Budgets inherit ERPNext's standard multi-currency and exchange rate conversion engine.

---

## API Reference

EPCForge exposes whitelisted Python methods for integration:

- `epcforge.utils.get_project_summary(project_name)`: Returns consolidated BOQ, Budget, and Tender status for a project.
- `epcforge.utils.update_session_default_project(doc, method)`: Lifecycle hook updating active project defaults.

---

## Support

For issues, feature requests, or professional support:

- 📧 **Email:** [hello@invento.com.bd](mailto:hello@invento.com.bd)
- 🐞 **GitHub Issues:** [Open an Issue](https://github.com/invento-software-limited//epcforge/issues)
- 🌟 **Contribute:** Star the repository and submit pull requests on GitHub.
