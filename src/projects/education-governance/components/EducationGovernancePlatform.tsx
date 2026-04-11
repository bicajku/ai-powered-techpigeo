import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart, AlertTriangle, Users, BookOpen, Calendar, 
  FileText, Bell, ClipboardCheck, Wallet
} from "@phosphor-icons/react"
import { GovernanceUser } from "@/projects/education-governance/types"
import { RoleLabels } from "@/projects/education-governance/lib/rbac"
import GovernanceDashboard from "./GovernanceDashboard"
import SchoolManagement from "./SchoolManagement"
import PolicyCenter from "./PolicyCenter"
import LeaveManagement from "./LeaveManagement"
import AttendanceTracker from "./AttendanceTracker"
import DocumentTracker from "./DocumentTracker"
import NotificationsCenter from "./NotificationsCenter"
import ComplianceQA from "./ComplianceQA"
import FinanceManagement from "./FinanceManagement"

interface EducationGovernancePlatformProps {
  user: GovernanceUser
}

export function EducationGovernancePlatform({ user }: EducationGovernancePlatformProps) {
  const roleLabel = RoleLabels[user.role]
  const isUrdu = user.languagePreference === "urdu" || user.languagePreference === "bilingual"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <span className="text-blue-600">AJK Education Governance</span>
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                {isUrdu ? "وفاقی سطح کے نگرانی کے لیے مرکزی پلیٹ فارم" : "Centralized governance platform"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium text-slate-900">{user.fullName}</p>
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 mt-1">
                {roleLabel[isUrdu ? "ur" : "en"]}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-9 h-auto p-1 bg-white border border-slate-200 rounded-lg shadow-sm">
            <TabsTrigger value="dashboard" className="flex items-center gap-1 text-xs">
              <BarChart size={16} weight="duotone" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="schools" className="flex items-center gap-1 text-xs">
              <Users size={16} weight="duotone" />
              <span className="hidden sm:inline">Schools</span>
            </TabsTrigger>
            <TabsTrigger value="policy" className="flex items-center gap-1 text-xs">
              <BookOpen size={16} weight="duotone" />
              <span className="hidden sm:inline">Policy</span>
            </TabsTrigger>
            <TabsTrigger value="leave" className="flex items-center gap-1 text-xs">
              <Calendar size={16} weight="duotone" />
              <span className="hidden sm:inline">Leave</span>
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex items-center gap-1 text-xs">
              <FileText size={16} weight="duotone" />
              <span className="hidden sm:inline">Attendance</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1 text-xs">
              <FileText size={16} weight="duotone" />
              <span className="hidden sm:inline">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1 text-xs">
              <Bell size={16} weight="duotone" />
              <span className="hidden sm:inline">Alerts</span>
            </TabsTrigger>
            <TabsTrigger value="compliance" className="flex items-center gap-1 text-xs">
              <ClipboardCheck size={16} weight="duotone" />
              <span className="hidden sm:inline">Compliance</span>
            </TabsTrigger>
            <TabsTrigger value="finance" className="flex items-center gap-1 text-xs">
              <Wallet size={16} weight="duotone" />
              <span className="hidden sm:inline">Finance</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6 space-y-6">
            <GovernanceDashboard user={user} />
          </TabsContent>

          <TabsContent value="schools" className="mt-6 space-y-6">
            <SchoolManagement user={user} />
          </TabsContent>

          <TabsContent value="policy" className="mt-6 space-y-6">
            <PolicyCenter user={user} />
          </TabsContent>

          <TabsContent value="leave" className="mt-6 space-y-6">
            <LeaveManagement user={user} />
          </TabsContent>

          <TabsContent value="attendance" className="mt-6 space-y-6">
            <AttendanceTracker user={user} />
          </TabsContent>

          <TabsContent value="documents" className="mt-6 space-y-6">
            <DocumentTracker user={user} />
          </TabsContent>

          <TabsContent value="notifications" className="mt-6 space-y-6">
            <NotificationsCenter user={user} />
          </TabsContent>

          <TabsContent value="compliance" className="mt-6 space-y-6">
            <ComplianceQA user={user} />
          </TabsContent>

          <TabsContent value="finance" className="mt-6 space-y-6">
            <FinanceManagement user={user} />
          </TabsContent>
        </Tabs>

        {/* Powered by NovusSparks */}
        <div className="mt-12 text-center text-xs text-slate-500">
          <p>Powered by <span className="font-semibold text-blue-600">NovusSparks AI</span> • Education Governance Platform</p>
        </div>
      </div>
    </div>
  )
}
