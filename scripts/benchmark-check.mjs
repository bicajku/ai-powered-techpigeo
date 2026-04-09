import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const csvPath = path.join(root, "benchmark-run-template.csv")
const baselinePath = path.join(root, "benchmark", "baseline.json")

function parseCsv(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const headers = lines[0].split(",").map((h) => h.trim())
  const last = lines[lines.length - 1].split(",")
  const record = {}
  headers.forEach((header, index) => {
    record[header] = (last[index] || "").trim()
  })
  return record
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) {
    return {
      minRiskBandAccuracy: 0.7,
      maxFalsePositiveRate: 0.2,
      maxFalseNegativeRate: 0.2,
      maxMeaningPreservationFailureRate: 0.2,
      minEvidenceCompletenessRate: 0.6,
    }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"))
    return {
      minRiskBandAccuracy: toNumber(parsed.minRiskBandAccuracy, 0.7),
      maxFalsePositiveRate: toNumber(parsed.maxFalsePositiveRate, 0.2),
      maxFalseNegativeRate: toNumber(parsed.maxFalseNegativeRate, 0.2),
      maxMeaningPreservationFailureRate: toNumber(parsed.maxMeaningPreservationFailureRate, 0.2),
      minEvidenceCompletenessRate: toNumber(parsed.minEvidenceCompletenessRate, 0.6),
    }
  } catch {
    return {
      minRiskBandAccuracy: 0.7,
      maxFalsePositiveRate: 0.2,
      maxFalseNegativeRate: 0.2,
      maxMeaningPreservationFailureRate: 0.2,
      minEvidenceCompletenessRate: 0.6,
    }
  }
}

function main() {
  if (!fs.existsSync(csvPath)) {
    console.log("[benchmark-check] benchmark-run-template.csv not found; skipping benchmark gate.")
    return
  }

  const record = parseCsv(fs.readFileSync(csvPath, "utf8"))
  if (!record) {
    console.log("[benchmark-check] no benchmark rows found; skipping benchmark gate.")
    return
  }

  const baseline = loadBaseline()

  const metrics = {
    riskBandAccuracy: toNumber(record.risk_band_accuracy),
    falsePositiveRate: toNumber(record.false_positive_rate),
    falseNegativeRate: toNumber(record.false_negative_rate),
    evidenceCompletenessRate: toNumber(record.evidence_completeness_rate),
    meaningPreservationFailureRate: toNumber(record.meaning_preservation_failure_rate),
  }

  const failures = []
  if (metrics.riskBandAccuracy < baseline.minRiskBandAccuracy) failures.push(`risk_band_accuracy ${metrics.riskBandAccuracy} < ${baseline.minRiskBandAccuracy}`)
  if (metrics.falsePositiveRate > baseline.maxFalsePositiveRate) failures.push(`false_positive_rate ${metrics.falsePositiveRate} > ${baseline.maxFalsePositiveRate}`)
  if (metrics.falseNegativeRate > baseline.maxFalseNegativeRate) failures.push(`false_negative_rate ${metrics.falseNegativeRate} > ${baseline.maxFalseNegativeRate}`)
  if (metrics.evidenceCompletenessRate < baseline.minEvidenceCompletenessRate) failures.push(`evidence_completeness_rate ${metrics.evidenceCompletenessRate} < ${baseline.minEvidenceCompletenessRate}`)
  if (metrics.meaningPreservationFailureRate > baseline.maxMeaningPreservationFailureRate) failures.push(`meaning_preservation_failure_rate ${metrics.meaningPreservationFailureRate} > ${baseline.maxMeaningPreservationFailureRate}`)

  const enforce = String(process.env.BENCHMARK_ENFORCE || "false").toLowerCase() === "true"

  if (failures.length === 0) {
    console.log("[benchmark-check] PASS")
    return
  }

  console.log("[benchmark-check] FAILURES")
  failures.forEach((line) => console.log(`- ${line}`))

  if (enforce) {
    process.exitCode = 1
  } else {
    console.log("[benchmark-check] Non-blocking mode (set BENCHMARK_ENFORCE=true to enforce).")
  }
}

main()
