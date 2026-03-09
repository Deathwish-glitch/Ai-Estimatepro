export const formatINR = (value) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeValue);
};

export const formatNumber = (value, digits = 2) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return safeValue.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
};