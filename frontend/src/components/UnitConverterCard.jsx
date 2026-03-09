import { useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const UnitConverterCard = () => {
  const [feetValue, setFeetValue] = useState(0);
  const [meterValue, setMeterValue] = useState(0);
  const [cubicMeter, setCubicMeter] = useState(0);
  const [cubicFeet, setCubicFeet] = useState(0);

  const feetToMeter = useMemo(() => Number(feetValue || 0) * 0.3048, [feetValue]);
  const meterToFeet = useMemo(() => Number(meterValue || 0) * 3.28084, [meterValue]);
  const m3ToFt3 = useMemo(() => Number(cubicMeter || 0) * 35.3147, [cubicMeter]);
  const ft3ToM3 = useMemo(() => Number(cubicFeet || 0) * 0.0283168, [cubicFeet]);

  return (
    <Card className="border-slate-200 bg-white shadow-sm" data-testid="unit-converter-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg" data-testid="unit-converter-title">
          <Repeat size={18} className="text-orange-500" /> Unit Converter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-slate-600" data-testid="feet-input-label">
              Feet → Meter
            </label>
            <Input
              type="number"
              value={feetValue}
              data-testid="feet-input-field"
              onChange={(event) => setFeetValue(event.target.value)}
            />
            <p className="mt-2 font-mono text-sm" data-testid="feet-to-meter-result">
              {feetToMeter.toFixed(2)} m
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-600" data-testid="meter-input-label">
              Meter → Feet
            </label>
            <Input
              type="number"
              value={meterValue}
              data-testid="meter-input-field"
              onChange={(event) => setMeterValue(event.target.value)}
            />
            <p className="mt-2 font-mono text-sm" data-testid="meter-to-feet-result">
              {meterToFeet.toFixed(2)} ft
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-slate-600" data-testid="cubic-meter-input-label">
              Cubic meter → Cubic feet
            </label>
            <Input
              type="number"
              value={cubicMeter}
              data-testid="cubic-meter-input-field"
              onChange={(event) => setCubicMeter(event.target.value)}
            />
            <p className="mt-2 font-mono text-sm" data-testid="cubic-meter-to-feet-result">
              {m3ToFt3.toFixed(2)} ft³
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-600" data-testid="cubic-feet-input-label">
              Cubic feet → Cubic meter
            </label>
            <Input
              type="number"
              value={cubicFeet}
              data-testid="cubic-feet-input-field"
              onChange={(event) => setCubicFeet(event.target.value)}
            />
            <p className="mt-2 font-mono text-sm" data-testid="cubic-feet-to-meter-result">
              {ft3ToM3.toFixed(2)} m³
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};