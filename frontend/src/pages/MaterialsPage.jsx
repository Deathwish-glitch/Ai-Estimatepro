import { Link } from "react-router-dom";
import { MaterialsBarChart } from "@/components/MaterialsBarChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuildCalc } from "@/context/BuildCalcContext";
import { formatNumber } from "@/utils/formatters";

export default function MaterialsPage() {
  const { latestEstimate } = useBuildCalc();
  const detailedMaterials = latestEstimate?.detailed_materials?.length
    ? latestEstimate.detailed_materials
    : (latestEstimate?.materials || []).map((item) => ({
        ...item,
        category: "General",
        note: "Generated from summary estimate",
      }));
  const categorySummary = detailedMaterials.reduce((accumulator, item) => {
    accumulator[item.category] = (accumulator[item.category] || 0) + 1;
    return accumulator;
  }, {});

  if (!latestEstimate) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm" data-testid="materials-empty-state-card">
        <CardHeader>
          <CardTitle data-testid="materials-empty-state-title">No material data yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600" data-testid="materials-empty-state-description">
            Generate your estimate first to view the material quantity calculator.
          </p>
          <Link to="/estimate" data-testid="materials-empty-state-link">
            <Button className="rounded-full" data-testid="materials-go-to-estimate-button">Go to Estimate</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 reveal-up" data-testid="materials-page">
      <div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="materials-page-heading">
          BOQ - Detailed Material Calculator
        </h1>
        <p className="text-sm text-slate-600 md:text-base" data-testid="materials-page-subheading">
          Approximate BOQ-style quantities across structural, masonry, finishing, MEP and openings.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="materials-category-summary-grid">
        {Object.entries(categorySummary).map(([category, count]) => (
          <Card key={category} className="border-slate-200 bg-white shadow-sm" data-testid={`materials-category-card-${category.toLowerCase()}`}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500" data-testid={`materials-category-title-${category.toLowerCase()}`}>
                {category}
              </p>
              <p className="font-mono text-lg text-slate-900" data-testid={`materials-category-count-${category.toLowerCase()}`}>
                {count} items
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-slate-200 bg-white shadow-sm" data-testid="materials-table-card">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="materials-table-title">
            Detailed Materials Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="materials-table">
            <TableHeader>
              <TableRow>
                <TableHead data-testid="materials-table-header-category">Category</TableHead>
                <TableHead data-testid="materials-table-header-material">Material</TableHead>
                <TableHead data-testid="materials-table-header-quantity">Quantity</TableHead>
                <TableHead data-testid="materials-table-header-unit">Unit</TableHead>
                <TableHead data-testid="materials-table-header-note">Usage Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailedMaterials.map((material) => (
                <TableRow key={`${material.category}-${material.name}`} data-testid={`materials-row-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <TableCell className="text-xs uppercase text-slate-500" data-testid={`materials-category-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>
                    {material.category}
                  </TableCell>
                  <TableCell data-testid={`materials-name-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>{material.name}</TableCell>
                  <TableCell className="font-mono" data-testid={`materials-quantity-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>
                    {formatNumber(material.quantity)}
                  </TableCell>
                  <TableCell data-testid={`materials-unit-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>{material.unit}</TableCell>
                  <TableCell className="text-sm text-slate-600" data-testid={`materials-note-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>
                    {material.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MaterialsBarChart materials={latestEstimate.materials} />
    </div>
  );
}