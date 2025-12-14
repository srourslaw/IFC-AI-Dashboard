/**
 * Exports Page - Data export and takeoff generation
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
  TableCellsIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { useExportToExcel, useGenerateTakeoffs, useSplitStoreys } from '@/hooks/useIFCData'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'

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

interface ExportResult {
  type: 'excel' | 'takeoff' | 'split'
  success: boolean
  message: string
  details?: string
  files?: string[]
}

export function ExportsPage() {
  const { currentModel } = useAppStore()
  const exportToExcel = useExportToExcel()
  const generateTakeoffs = useGenerateTakeoffs()
  const splitStoreys = useSplitStoreys()
  const [results, setResults] = useState<ExportResult[]>([])

  const handleExportExcel = async () => {
    try {
      const result = await exportToExcel.mutateAsync({})
      setResults(prev => [{
        type: 'excel',
        success: true,
        message: 'Excel export completed',
        details: `${result.row_count} elements exported`,
        files: [result.file_path],
      }, ...prev])
    } catch {
      setResults(prev => [{
        type: 'excel',
        success: false,
        message: 'Excel export failed',
      }, ...prev])
    }
  }

  const handleGenerateTakeoffs = async () => {
    try {
      const result = await generateTakeoffs.mutateAsync({})
      setResults(prev => [{
        type: 'takeoff',
        success: true,
        message: 'Takeoff files generated',
        details: `${result.steps.length} files created`,
        files: result.steps.map(s => s.file),
      }, ...prev])
    } catch {
      setResults(prev => [{
        type: 'takeoff',
        success: false,
        message: 'Takeoff generation failed',
      }, ...prev])
    }
  }

  const handleSplitStoreys = async () => {
    try {
      const result = await splitStoreys.mutateAsync({})
      setResults(prev => [{
        type: 'split',
        success: true,
        message: 'Storey split completed',
        details: `${result.results.length} files created`,
        files: result.results.map(r => r.file),
      }, ...prev])
    } catch {
      setResults(prev => [{
        type: 'split',
        success: false,
        message: 'Storey split failed',
      }, ...prev])
    }
  }

  if (!currentModel) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex items-center justify-center"
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12">
            <ArrowDownTrayIcon className="h-16 w-16 mx-auto text-secondary-600" />
            <h2 className="text-xl font-semibold text-secondary-200 mt-4">No Model Loaded</h2>
            <p className="text-secondary-500 mt-2">
              Load an IFC model to export data
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

  const exportOptions = [
    {
      id: 'excel',
      title: 'Export to Excel',
      description: 'Export all IFC elements with attributes to an Excel spreadsheet. Includes element types, properties, storey assignments, and more.',
      icon: TableCellsIcon,
      color: 'success',
      action: handleExportExcel,
      loading: exportToExcel.isPending,
    },
    {
      id: 'takeoff',
      title: 'Generate Takeoffs',
      description: 'Create cumulative IFC files for construction sequencing. Step 1 contains first floor, Step 2 adds second floor, and so on.',
      icon: DocumentArrowDownIcon,
      color: 'primary',
      action: handleGenerateTakeoffs,
      loading: generateTakeoffs.isPending,
    },
    {
      id: 'split',
      title: 'Split Storeys',
      description: 'Generate separate IFC files for each building storey. Useful for floor-by-floor analysis or sharing specific levels.',
      icon: BuildingOffice2Icon,
      color: 'warning',
      action: handleSplitStoreys,
      loading: splitStoreys.isPending,
    },
  ]

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-secondary-100">Export Center</h1>
        <p className="text-secondary-400 mt-1">
          Generate reports and export data from {currentModel.file_name}
        </p>
      </motion.div>

      {/* Export Options Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {exportOptions.map((option) => (
          <Card key={option.id} hover className="relative overflow-hidden group">
            {/* Background gradient */}
            <div className={cn(
              'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300',
              option.color === 'success' && 'bg-gradient-to-br from-success-500/10 to-transparent',
              option.color === 'primary' && 'bg-gradient-to-br from-primary-500/10 to-transparent',
              option.color === 'warning' && 'bg-gradient-to-br from-warning-500/10 to-transparent',
            )} />

            <CardContent className="relative p-6">
              <div className={cn(
                'p-4 rounded-xl inline-block',
                option.color === 'success' && 'bg-success-500/10',
                option.color === 'primary' && 'bg-primary-500/10',
                option.color === 'warning' && 'bg-warning-500/10',
              )}>
                <option.icon className={cn(
                  'h-8 w-8',
                  option.color === 'success' && 'text-success-400',
                  option.color === 'primary' && 'text-primary-400',
                  option.color === 'warning' && 'text-warning-400',
                )} />
              </div>

              <h3 className="text-xl font-semibold text-secondary-100 mt-4">
                {option.title}
              </h3>
              <p className="text-secondary-400 text-sm mt-2 leading-relaxed">
                {option.description}
              </p>

              <Button
                variant={option.color === 'success' ? 'success' : option.color === 'warning' ? 'secondary' : 'primary'}
                className="mt-6 w-full"
                leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
                onClick={option.action}
                loading={option.loading}
              >
                Generate
              </Button>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Export History */}
      {results.length > 0 && (
        <motion.div
          variants={itemVariants}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader action={
              <Button variant="ghost" size="sm" onClick={() => setResults([])}>
                Clear History
              </Button>
            }>
              <CardTitle subtitle="Recent export operations">Export History</CardTitle>
            </CardHeader>
            <CardContent noPadding>
              <div className="divide-y divide-secondary-800/50">
                {results.map((result, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 flex items-start gap-4"
                  >
                    <div className={cn(
                      'p-2 rounded-lg',
                      result.success ? 'bg-success-500/10' : 'bg-danger-500/10'
                    )}>
                      {result.success ? (
                        <CheckCircleIcon className="h-5 w-5 text-success-400" />
                      ) : (
                        <FolderOpenIcon className="h-5 w-5 text-danger-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-secondary-200">{result.message}</p>
                        <Badge variant={result.success ? 'success' : 'danger'} size="sm">
                          {result.success ? 'Success' : 'Failed'}
                        </Badge>
                      </div>
                      {result.details && (
                        <p className="text-secondary-500 text-sm mt-1">{result.details}</p>
                      )}
                      {result.files && result.files.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {result.files.slice(0, 3).map((file, i) => (
                            <p key={i} className="text-xs text-secondary-600 font-mono truncate">
                              {file}
                            </p>
                          ))}
                          {result.files.length > 3 && (
                            <p className="text-xs text-secondary-500">
                              +{result.files.length - 3} more files
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Info Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-secondary-900/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <TableCellsIcon className="h-5 w-5 text-primary-400" />
              </div>
              <div className="text-sm">
                <p className="font-medium text-secondary-300">Excel Export Format</p>
                <p className="text-secondary-500 mt-1">
                  Exports include: Step ID, IFC Type, Global ID, Name, Object Type,
                  Predefined Type, Storey Name, and Storey Elevation for each element.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-secondary-900/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-warning-500/10">
                <DocumentArrowDownIcon className="h-5 w-5 text-warning-400" />
              </div>
              <div className="text-sm">
                <p className="font-medium text-secondary-300">Takeoff Sequence</p>
                <p className="text-secondary-500 mt-1">
                  Cumulative takeoffs are perfect for construction scheduling and
                  4D BIM visualization. Each step builds upon the previous floors.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
