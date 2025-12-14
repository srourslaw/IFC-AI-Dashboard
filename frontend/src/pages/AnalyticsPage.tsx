/**
 * Analytics Page - Charts and statistics
 */
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts'
import {
  ChartBarIcon,
  CubeIcon,
  BuildingOffice2Icon,
  TableCellsIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, StatCard, Skeleton } from '@/components/ui'
import { useAnalytics, useElementCounts, useStoreys } from '@/hooks/useIFCData'
import { useAppStore } from '@/store/appStore'
import { formatNumber, generateChartColors, getIfcTypeColor } from '@/lib/utils'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-secondary-800 border border-secondary-700 rounded-lg p-3 shadow-lg">
        <p className="text-secondary-300 font-medium">{label}</p>
        <p className="text-primary-400 font-bold">{formatNumber(payload[0].value)}</p>
      </div>
    )
  }
  return null
}

export function AnalyticsPage() {
  const { currentModel } = useAppStore()
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics()
  const { data: elementData, isLoading: elementsLoading } = useElementCounts()
  const { data: storeysData, isLoading: storeysLoading } = useStoreys()

  if (!currentModel) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex items-center justify-center"
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12">
            <ChartBarIcon className="h-16 w-16 mx-auto text-secondary-600" />
            <h2 className="text-xl font-semibold text-secondary-200 mt-4">No Model Loaded</h2>
            <p className="text-secondary-500 mt-2">
              Load an IFC model to view analytics
            </p>
            <Link to="/dashboard">
              <Button className="mt-6">
                Upload a Model
              </Button>
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  const isLoading = analyticsLoading || elementsLoading || storeysLoading

  // Prepare chart data
  const barChartData = elementData?.counts.slice(0, 10).map(item => ({
    name: item.ifc_type.replace('Ifc', ''),
    count: item.count,
    fill: getIfcTypeColor(item.ifc_type),
  })) || []

  const pieChartData = elementData?.counts.slice(0, 8).map(item => ({
    name: item.ifc_type.replace('Ifc', ''),
    value: item.count,
    percentage: item.percentage,
  })) || []

  const storeyChartData = storeysData?.storeys.map(storey => ({
    name: storey.name,
    elements: storey.element_count || 0,
    elevation: storey.elevation,
  })) || []

  const colors = generateChartColors(pieChartData.length)

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-secondary-100">Analytics Dashboard</h1>
        <p className="text-secondary-400 mt-1">
          Comprehensive analysis of {currentModel.file_name}
        </p>
      </motion.div>

      {/* Quick Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Elements"
          value={analytics?.total_elements || 0}
          icon={<CubeIcon className="h-6 w-6" />}
          color="primary"
          loading={isLoading}
        />
        <StatCard
          title="Building Storeys"
          value={analytics?.total_storeys || 0}
          icon={<BuildingOffice2Icon className="h-6 w-6" />}
          color="success"
          loading={isLoading}
        />
        <StatCard
          title="Element Types"
          value={elementData?.counts.length || 0}
          icon={<TableCellsIcon className="h-6 w-6" />}
          color="warning"
          loading={isLoading}
        />
        <StatCard
          title="Avg per Storey"
          value={analytics?.total_storeys ? Math.round((analytics?.total_elements || 0) / analytics.total_storeys) : 0}
          icon={<ChartBarIcon className="h-6 w-6" />}
          color="info"
          loading={isLoading}
        />
      </motion.div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Element Types */}
        <motion.div variants={itemVariants}>
          <Card className="h-[400px]">
            <CardHeader>
              <CardTitle subtitle="Top 10 element types by count">Element Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              {isLoading ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" stroke="#64748b" fontSize={12} tickFormatter={(value) => formatNumber(value)} />
                    <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={100} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {barChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Pie Chart - Element Distribution */}
        <motion.div variants={itemVariants}>
          <Card className="h-[400px]">
            <CardHeader>
              <CardTitle subtitle="Percentage breakdown">Type Composition</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              {isLoading ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percentage }) => `${name} (${percentage.toFixed(1)}%)`}
                      labelLine={false}
                    >
                      {pieChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="bg-secondary-800 border border-secondary-700 rounded-lg p-3">
                              <p className="text-secondary-300 font-medium">{data.name}</p>
                              <p className="text-primary-400">{formatNumber(data.value)} elements</p>
                              <p className="text-secondary-500 text-sm">{data.percentage.toFixed(1)}%</p>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Legend
                      formatter={(value: string) => <span className="text-secondary-400 text-sm">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <motion.div variants={itemVariants}>
        <Card className="h-[400px]">
          <CardHeader>
            <CardTitle subtitle="Elements per floor level">Storey Analysis</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {isLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={storeyChartData}>
                  <defs>
                    <linearGradient id="colorElements" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} angle={-45} textAnchor="end" height={80} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(value) => formatNumber(value)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="elements"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#colorElements)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Element Types Table */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle subtitle="Complete breakdown of all element types">All Element Types</CardTitle>
          </CardHeader>
          <CardContent noPadding>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-secondary-800">
                    <th className="table-header px-6 py-4">Type</th>
                    <th className="table-header px-6 py-4 text-right">Count</th>
                    <th className="table-header px-6 py-4 text-right">Percentage</th>
                    <th className="table-header px-6 py-4">Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {elementData?.counts.map((element) => (
                    <tr key={element.ifc_type} className="table-row">
                      <td className="table-cell font-medium">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: getIfcTypeColor(element.ifc_type) }}
                          />
                          {element.ifc_type}
                        </div>
                      </td>
                      <td className="table-cell text-right font-mono">
                        {formatNumber(element.count)}
                      </td>
                      <td className="table-cell text-right">
                        {element.percentage.toFixed(2)}%
                      </td>
                      <td className="table-cell">
                        <div className="w-full bg-secondary-800 rounded-full h-2 max-w-[200px]">
                          <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{
                              width: `${element.percentage}%`,
                              backgroundColor: getIfcTypeColor(element.ifc_type),
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
