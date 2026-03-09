import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSupplierRatesApi, getWhatsappStatusApi, submitSupplierRatesApi } from "@/services/api";
import { formatINR } from "@/utils/formatters";

const initialSupplierForm = {
  supplier_name: "",
  location: "Nashik",
  cement_rate: "",
  steel_rate: "",
  sand_rate: "",
  brick_rate: "",
};

export default function SuppliersPage() {
  const [formData, setFormData] = useState(initialSupplierForm);
  const [records, setRecords] = useState([]);
  const [whatsappStatus, setWhatsappStatus] = useState({ configured: false });
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [supplierResponse, whatsappResponse] = await Promise.all([
        getSupplierRatesApi(),
        getWhatsappStatusApi(),
      ]);
      setRecords(supplierResponse.data || []);
      setWhatsappStatus(whatsappResponse.data || { configured: false });
    } catch {
      toast.error("Unable to load supplier dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateField = (field, value) => setFormData((previous) => ({ ...previous, [field]: value }));

  const onSubmitSupplierRates = async () => {
    if (!formData.supplier_name.trim()) {
      toast.error("Supplier name is required.");
      return;
    }
    try {
      await submitSupplierRatesApi({
        supplier_name: formData.supplier_name,
        location: formData.location,
        prices: [
          { material: "Cement", rate: Number(formData.cement_rate || 0), unit: "bag" },
          { material: "Steel", rate: Number(formData.steel_rate || 0), unit: "kg" },
          { material: "Sand", rate: Number(formData.sand_rate || 0), unit: "brass" },
          { material: "Brick", rate: Number(formData.brick_rate || 0), unit: "nos" },
        ].filter((item) => item.rate > 0),
      });
      toast.success("Supplier rates submitted.");
      setFormData(initialSupplierForm);
      await fetchData();
    } catch {
      toast.error("Unable to submit supplier rates.");
    }
  };

  return (
    <div className="space-y-6 reveal-up" data-testid="suppliers-page">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="suppliers-header">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="suppliers-page-heading">
          Supplier Rate Update Dashboard
        </h1>
        <p className="text-sm text-slate-600 md:text-base" data-testid="suppliers-page-description">
          Local suppliers can push daily or weekly rates and instantly improve estimate accuracy.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="suppliers-content-grid">
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="supplier-form-card">
          <CardHeader>
            <CardTitle className="text-2xl" data-testid="supplier-form-title">Submit Supplier Prices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={formData.supplier_name} onChange={(event) => updateField("supplier_name", event.target.value)} data-testid="supplier-name-input" placeholder="Supplier name" />
            <Input value={formData.location} onChange={(event) => updateField("location", event.target.value)} data-testid="supplier-location-input" placeholder="Location" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input type="number" value={formData.cement_rate} onChange={(event) => updateField("cement_rate", event.target.value)} data-testid="supplier-cement-rate-input" placeholder="Cement (₹/bag)" />
              <Input type="number" value={formData.steel_rate} onChange={(event) => updateField("steel_rate", event.target.value)} data-testid="supplier-steel-rate-input" placeholder="Steel (₹/kg)" />
              <Input type="number" value={formData.sand_rate} onChange={(event) => updateField("sand_rate", event.target.value)} data-testid="supplier-sand-rate-input" placeholder="Sand (₹/brass)" />
              <Input type="number" value={formData.brick_rate} onChange={(event) => updateField("brick_rate", event.target.value)} data-testid="supplier-brick-rate-input" placeholder="Brick (₹/nos)" />
            </div>
            <Button onClick={onSubmitSupplierRates} data-testid="supplier-submit-button">Update Rates</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm" data-testid="whatsapp-integration-card">
          <CardHeader>
            <CardTitle className="text-2xl" data-testid="whatsapp-integration-title">WhatsApp Rate Integration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600" data-testid="whatsapp-integration-status">
              Mode: Meta Cloud API Webhook • Configured: <strong>{whatsappStatus.configured ? "Yes" : "No"}</strong>
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="whatsapp-format-sample">
              <p className="font-medium">Supplier message format:</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs">RATE UPDATE{"\n"}Cement 390{"\n"}Steel 62{"\n"}Sand 3400{"\n"}Brick 10</pre>
            </div>
            <p className="text-xs text-slate-500" data-testid="whatsapp-webhook-path-info">
              Webhook path: <code>/api/whatsapp/webhook</code>
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="border-slate-200 bg-white shadow-sm" data-testid="supplier-records-table-card">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="supplier-records-table-title">Recent Supplier Updates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="supplier-records-table">
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Cement</TableHead>
                <TableHead>Steel</TableHead>
                <TableHead>Sand</TableHead>
                <TableHead>Brick</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => {
                const findRate = (material) => record.prices.find((item) => item.material === material)?.rate || 0;
                return (
                  <TableRow key={record.id} data-testid={`supplier-record-row-${record.id}`}>
                    <TableCell>{record.supplier_name}</TableCell>
                    <TableCell>{record.location}</TableCell>
                    <TableCell className="font-mono">{formatINR(findRate("Cement"))}</TableCell>
                    <TableCell className="font-mono">{formatINR(findRate("Steel"))}</TableCell>
                    <TableCell className="font-mono">{formatINR(findRate("Sand"))}</TableCell>
                    <TableCell className="font-mono">{formatINR(findRate("Brick"))}</TableCell>
                    <TableCell>{new Date(record.updated_at).toLocaleString("en-IN")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {loading ? <p className="mt-2 text-xs text-slate-500" data-testid="supplier-records-loading">Loading supplier updates...</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}