/**
 * Sentinel SAAS - Organization Branding Settings
 */

import React, { useEffect, useState } from "react"
import { dbGetBranding, dbUpsertBranding } from "../../api/db"
import { DEFAULT_SENTINEL_BRANDING } from "../../config"
import { useSentinelAuth } from "../../hooks/useSentinelAuth"
import type { OrganizationBranding } from "../../types/index"
import { v4 as uuidv4 } from "uuid"

interface OrganizationSettingsProps {
  organizationId: string
  onSaved?: () => void
}

export function OrganizationSettings({ organizationId, onSaved }: OrganizationSettingsProps) {
  const { user } = useSentinelAuth()
  const [branding, setBranding] = useState<OrganizationBranding | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
    primaryColor: "#1e1b4b",
    secondaryColor: "#4f46e5",
    accentColor: "#fbbf24",
    phone: "",
    email: "",
    officeAddress: "",
    website: "",
    useCustomBranding: false,
  })

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const stored = await dbGetBranding(organizationId)
        if (stored) {
          setBranding(stored)
          setForm({
            name: stored.name,
            logoUrl: stored.logoUrl,
            primaryColor: stored.primaryColor,
            secondaryColor: stored.secondaryColor,
            accentColor: stored.accentColor ?? "#fbbf24",
            phone: stored.phone,
            email: stored.email,
            officeAddress: stored.officeAddress,
            website: stored.website ?? "",
            useCustomBranding: stored.useCustomBranding,
          })
        } else {
          // Pre-fill with Sentinel defaults
          setForm((f) => ({
            ...f,
            email: DEFAULT_SENTINEL_BRANDING.email,
            officeAddress: DEFAULT_SENTINEL_BRANDING.officeAddress,
          }))
        }
      } catch (err) {
        console.error("Load branding error:", err)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [organizationId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setIsSaving(true)
    setSaveMessage(null)

    try {
      const updated: OrganizationBranding = {
        id: branding?.id ?? uuidv4(),
        organizationId,
        name: form.name,
        logoUrl: form.logoUrl,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        accentColor: form.accentColor || undefined,
        phone: form.phone,
        email: form.email,
        officeAddress: form.officeAddress,
        website: form.website || undefined,
        useCustomBranding: form.useCustomBranding,
        createdAt: branding?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      }

      await dbUpsertBranding(updated)
      setBranding(updated)
      setSaveMessage({ type: "success", text: "Organization settings saved successfully!" })
      onSaved?.()
    } catch {
      setSaveMessage({ type: "error", text: "Failed to save settings. Please try again." })
    } finally {
      setIsSaving(false)
    }
  }

  const update = (field: keyof typeof form, value: string | boolean) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading settings…</div>
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Organization Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure your organization branding. These settings are used in all exported documents.
          If not set, Sentinel branding is used by default.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Custom Branding Toggle */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.useCustomBranding}
              onChange={(e) => update("useCustomBranding", e.target.checked)}
              className="w-4 h-4 rounded accent-amber-600"
            />
            <div>
              <span className="text-sm font-medium text-amber-900">Use custom organization branding</span>
              <p className="text-xs text-amber-700 mt-0.5">
                When enabled, exports use your organization details. When disabled, Sentinel branding is used.
              </p>
            </div>
          </label>
        </div>

        {/* Branding Preview */}
        <div
          className="rounded-xl p-4 text-white"
          style={{
            background: `linear-gradient(135deg, ${form.primaryColor}, ${form.secondaryColor})`,
          }}
        >
          <div className="flex items-center gap-3">
            {form.logoUrl && (
              <img
                src={form.logoUrl}
                alt="Logo"
                className="w-10 h-10 rounded-full object-cover bg-white/20"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                }}
              />
            )}
            <div>
              <p className="font-bold text-sm">{form.name || "Your Organization"}</p>
              <p className="text-xs opacity-80">{form.email || "email@example.com"}</p>
            </div>
          </div>
          <p className="text-xs mt-2 opacity-70">Preview of report header</p>
        </div>

        {/* Form Fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Organization Name *"
            id="org-name"
            type="text"
            value={form.name}
            onChange={(v) => update("name", v)}
            placeholder="Your NGO Name"
            required
          />
          <FormField
            label="Logo URL"
            id="org-logo"
            type="url"
            value={form.logoUrl}
            onChange={(v) => update("logoUrl", v)}
            placeholder="https://example.com/logo.png"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="primary-color" className="block text-sm font-medium text-gray-700 mb-1">
              Primary Color
            </label>
            <div className="flex gap-2 items-center">
              <input
                id="primary-color"
                type="color"
                value={form.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="w-10 h-10 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                placeholder="#1e1b4b"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label htmlFor="secondary-color" className="block text-sm font-medium text-gray-700 mb-1">
              Secondary Color
            </label>
            <div className="flex gap-2 items-center">
              <input
                id="secondary-color"
                type="color"
                value={form.secondaryColor}
                onChange={(e) => update("secondaryColor", e.target.value)}
                className="w-10 h-10 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={form.secondaryColor}
                onChange={(e) => update("secondaryColor", e.target.value)}
                placeholder="#4f46e5"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Phone"
            id="org-phone"
            type="tel"
            value={form.phone}
            onChange={(v) => update("phone", v)}
            placeholder="+92 300 0000000"
          />
          <FormField
            label="Email *"
            id="org-email"
            type="email"
            value={form.email}
            onChange={(v) => update("email", v)}
            placeholder="contact@yourorg.org"
            required
          />
        </div>

        <FormField
          label="Office Address"
          id="org-address"
          type="text"
          value={form.officeAddress}
          onChange={(v) => update("officeAddress", v)}
          placeholder="123 Main Street, City, Country"
        />

        <FormField
          label="Website"
          id="org-website"
          type="url"
          value={form.website}
          onChange={(v) => update("website", v)}
          placeholder="https://yourorg.org"
        />

        {/* Feedback */}
        {saveMessage && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              saveMessage.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {saveMessage.text}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSaving || !form.name || !form.email}
            className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Settings"}
          </button>
          <button
            type="button"
            onClick={() =>
              setForm({
                name: "",
                logoUrl: "",
                primaryColor: DEFAULT_SENTINEL_BRANDING.primaryColor,
                secondaryColor: DEFAULT_SENTINEL_BRANDING.secondaryColor,
                accentColor: DEFAULT_SENTINEL_BRANDING.accentColor ?? "#fbbf24",
                phone: "",
                email: DEFAULT_SENTINEL_BRANDING.email,
                officeAddress: DEFAULT_SENTINEL_BRANDING.officeAddress,
                website: DEFAULT_SENTINEL_BRANDING.website ?? "",
                useCustomBranding: false,
              })
            }
            className="px-4 py-2.5 text-sm text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────── Helper ──────────────────────────────

interface FormFieldProps {
  label: string
  id: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}

function FormField({ label, id, type, value, onChange, placeholder, required }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
    </div>
  )
}
