import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useChartReady } from "@/hooks/useChartReady";
import {
  createMarketSourceEntriesApi,
  getMarketRateSettingsApi,
  getMarketRatesApi,
  getMarketTrendApi,
  scrapeMarketRatesApi,
  updateMarketRateSettingsApi,
} from "@/services/api";
import { formatINR } from "@/utils/formatters";

const initialSourceForm = {
  source_type: "government",
  supplier_name: "PWD Nashik",
  location: "Nashik",
  material: "Cement",
  rate: "382",
  unit: "bag",
  source_reference: "CPWD/PWD Schedule",
};

export default function LocalMarketRatesPage() {
  const chartReady = useChartReady();
  const [refreshFrequency, setRefreshFrequency] = useState("weekly");
  const [marketRates, setMarketRates] = useState([]);
  const [trendMaterial, setTrendMaterial] = useState("Cement");
  const [trendData, setTrendData] = useState([]);
  const [sourceForm, setSourceForm] = useState(initialSourceForm);
  const [scrapeUrls, setScrapeUrls] = useState("https://example.com/rates-page");
  const [loading, setLoading] = useState(false);

  const fetchData = async (frequency = refreshFrequency) => {
    setLoading(true);
    try {
      const [ratesResponse, trendResponse] = await Promise.all([
        getMarketRatesApi(frequency),
        getMarketTrendApi(trendMaterial),
      ]);
      setMarketRates(ratesResponse.data.items || []);
      setTrendData(trendResponse.data.points || []);
    } catch {
      toast.error("Unable to load local market rates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const settingsResponse = await getMarketRateSettingsApi();
        const frequency = settingsResponse.data.refresh_frequency || "weekly";
        setRefreshFrequency(frequency);
        await fetchData(frequency);
      } catch {
        await fetchData("weekly");
      }
    };
    init();
  }, []);

  useEffect(() => {
    getMarketTrendApi(trendMaterial)
      .then((response) => setTrendData(response.data.points || []))
      .catch(() => setTrendData([]));
  }, [trendMaterial]);

  const updateSourceField = (field, value) => setSourceForm((previous) => ({ ...previous, [field]: value }));

  const onSaveSettings = async () => {
    try {
      await updateMarketRateSettingsApi({ refresh_frequency: refreshFrequency });
      toast.success("Refresh settings updated.");
      await fetchData(refreshFrequency);
    } catch {
      toast.error("Unable to save refresh settings.");
    }
  };

  const onAddSourceRate = async () => {
    try {
      await createMarketSourceEntriesApi([
        {
          ...sourceForm,
          rate: Number(sourceForm.rate),
        },
      ]);
      toast.success("Market source rate added.");
      await fetchData(refreshFrequency);
    } catch {
      toast.error("Unable to add market source.");
    }
  };

  const onScrapeRates = async () => {
    const urls = scrapeUrls
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!urls.length) {
      toast.error("Please enter at least one URL.");
      return;
    }
    try {
      const response = await scrapeMarketRatesApi({ urls, location: "Nashik" });
      toast.success(`Scrape complete. ${response.data.created_entries} entries detected.`);
      await fetchData(refreshFrequency);
    } catch {
      toast.error("Scraping failed for provided URLs.");
    }
  };

  return (
    <div className="space-y-6 reveal-up" data-testid="local-market-rates-page">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="local-market-header">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="local-market-page-heading">
          Local Market Rates Intelligence
        </h1>
        <p className="text-sm text-slate-600 md:text-base" data-testid="local-market-page-description">
          Live Nashik and nearby material benchmarks from supplier updates, website listings, government rates, and WhatsApp feeds.
        </p>
      </section>

      <Card className="border-slate-200 bg-white shadow-sm" data-testid="local-market-controls-card">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="local-market-controls-title">Update Frequency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-2 block text-sm text-slate-600" data-testid="market-frequency-label">Refresh cycle</label>
            <Select value={refreshFrequency} onValueChange={setRefreshFrequency}>
              <SelectTrigger data-testid="market-frequency-select">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily" data-testid="market-frequency-option-daily">Daily</SelectItem>
                <SelectItem value="weekly" data-testid="market-frequency-option-weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onSaveSettings} data-testid="market-frequency-save-button">Save</Button>
          <Button variant="outline" onClick={() => fetchData(refreshFrequency)} data-testid="market-rates-refresh-button">
            <RefreshCw size={16} /> Refresh Now
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm" data-testid="market-rates-table-card">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="market-rates-table-title">Average Local Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="market-rates-table">
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Avg Local Rate</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Cheapest Supplier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketRates.map((item) => (
                <TableRow key={item.material} data-testid={`market-rate-row-${item.material.toLowerCase()}`}>
                  <TableCell>{item.material}</TableCell>
                  <TableCell className="font-mono">{formatINR(item.avg_local_rate)}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="font-mono">{item.source_count}</TableCell>
                  <TableCell>{item.cheapest_supplier || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {loading ? <p className="mt-2 text-xs text-slate-500" data-testid="market-rates-loading-text">Updating rates...</p> : null}
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="market-rates-analytics-grid">
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="market-trend-card">
          <CardHeader>
            <CardTitle className="text-2xl" data-testid="market-trend-title">Price Trend Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="mb-2 block text-sm text-slate-600">Material</label>
              <Select value={trendMaterial} onValueChange={setTrendMaterial}>
                <SelectTrigger data-testid="trend-material-select">
                  <SelectValue placeholder="Choose material" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cement">Cement</SelectItem>
                  <SelectItem value="Steel">Steel</SelectItem>
                  <SelectItem value="Sand">Sand</SelectItem>
                  <SelectItem value="Brick">Brick</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="h-72 min-h-72 w-full overflow-x-auto" data-testid="market-trend-chart-wrapper">
              {chartReady ? (
                <LineChart width={560} height={260} data={trendData}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="avg_rate" stroke="#F97316" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <div className="h-full w-full rounded-lg bg-slate-50" data-testid="market-trend-loading-placeholder" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm" data-testid="manual-source-card">
          <CardHeader>
            <CardTitle className="text-2xl" data-testid="manual-source-title">Add Source Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input value={sourceForm.supplier_name} onChange={(event) => updateSourceField("supplier_name", event.target.value)} data-testid="manual-source-supplier-input" placeholder="Supplier / Source" />
              <Input value={sourceForm.location} onChange={(event) => updateSourceField("location", event.target.value)} data-testid="manual-source-location-input" placeholder="Location" />
              <Input value={sourceForm.material} onChange={(event) => updateSourceField("material", event.target.value)} data-testid="manual-source-material-input" placeholder="Material" />
              <Input type="number" value={sourceForm.rate} onChange={(event) => updateSourceField("rate", event.target.value)} data-testid="manual-source-rate-input" placeholder="Rate" />
              <Input value={sourceForm.unit} onChange={(event) => updateSourceField("unit", event.target.value)} data-testid="manual-source-unit-input" placeholder="Unit" />
              <Select value={sourceForm.source_type} onValueChange={(value) => updateSourceField("source_type", value)}>
                <SelectTrigger data-testid="manual-source-type-select"><SelectValue placeholder="Source type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier_manual">Supplier Manual</SelectItem>
                  <SelectItem value="government">Government SOR</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input value={sourceForm.source_reference || ""} onChange={(event) => updateSourceField("source_reference", event.target.value)} data-testid="manual-source-reference-input" placeholder="Source reference" />
            <Button onClick={onAddSourceRate} data-testid="manual-source-submit-button">Add Rate Source</Button>
          </CardContent>
        </Card>
      </section>

      <Card className="border-slate-200 bg-white shadow-sm" data-testid="website-scrape-card">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="website-scrape-title">Website Listings Auto Ingestion (Best Effort)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={scrapeUrls}
            onChange={(event) => setScrapeUrls(event.target.value)}
            className="min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm"
            data-testid="website-scrape-url-textarea"
            placeholder="One URL per line"
          />
          <Button onClick={onScrapeRates} data-testid="website-scrape-run-button">Run URL Scrape</Button>
        </CardContent>
      </Card>
    </div>
  );
}