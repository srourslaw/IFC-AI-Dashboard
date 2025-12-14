/**
 * Storeys Page - Building storey management and splitting
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BuildingOffice2Icon,
  ScissorsIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Skeleton } from '@/components/ui'
import { useStoreys, useSplitStoreys } from '@/hooks/useIFCData'
import { useAppStore } from '@/store/appStore'
import { formatNumber, formatElevation, cn } from '@/lib/utils'

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

export function StoreysPage() {
  const { currentModel } = useAppStore()
  const { data: storeysData, isLoading } = useStoreys()
  const splitStoreys = useSplitStoreys()
  const [splitResults, setSplitResults] = useState<{
    results: Array<{ index: number; storey_name: string; file: string }>
  } | null>(null)

  const handleSplitStoreys = async () => {
    const result = await splitStoreys.mutateAsync({})
    setSplitResults(result)
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
            <BuildingOffice2Icon className="h-16 w-16 mx-auto text-secondary-600" />
            <h2 className="text-xl font-semibold text-secondary-200 mt-4">No Model Loaded</h2>
            <p className="text-secondary-500 mt-2">
              Load an IFC model to view and manage storeys
            </p>
            <Link to="/files">
              <Button className="mt-6">
                Load a Model
              </Button>
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-100">Building Storeys</h1>
          <p className="text-secondary-400 mt-1">
            View and manage building floor levels from {currentModel.file_name}
          </p>
        </div>
        <Badge variant="primary" size="lg">
          {storeysData?.total_count || 0} Storeys
        </Badge>
      </motion.div>

      {/* Actions Panel */}
      <motion.div variants={itemVariants}>
        <Card className="bg-gradient-to-r from-primary-500/10 to-accent-500/10 border-primary-500/20">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary-500/10">
                  <ScissorsIcon className="h-6 w-6 text-primary-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-secondary-100">Split Storeys</h3>
                  <p className="text-secondary-400 text-sm">
                    Generate separate IFC files for each building storey
                  </p>
                </div>
              </div>
              <Button
                leftIcon={<DocumentDuplicateIcon className="h-5 w-5" />}
                onClick={handleSplitStoreys}
                loading={splitStoreys.isPending}
                disabled={!storeysData?.storeys.length}
              >
                Split All Storeys
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Split Results */}
      {splitResults && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-success-500/30 bg-success-500/5">
            <CardHeader>
              <CardTitle subtitle="Files generated successfully">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-5 w-5 text-success-400" />
                  Split Complete
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent noPadding>
              <div className="divide-y divide-secondary-800/50">
                {splitResults.results.map((result) => (
                  <div key={result.index} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="success">{result.index}</Badge>
                      <span className="text-secondary-200">{result.storey_name}</span>
                    </div>
                    <span className="text-secondary-500 text-sm font-mono">{result.file}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Storeys Grid */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle subtitle="All building levels with elevation data">Storey Overview</CardTitle>
          </CardHeader>
          <CardContent noPadding>
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-secondary-800/50">
                {storeysData?.storeys.map((storey, index) => (
                  <motion.div
                    key={storey.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-6 flex items-center justify-between hover:bg-secondary-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-6">
                      {/* Floor indicator */}
                      <div className="relative">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                          <span className="text-xl font-bold text-primary-400">{storey.index + 1}</span>
                        </div>
                        {index < (storeysData?.storeys.length || 0) - 1 && (
                          <div className="absolute top-full left-1/2 w-0.5 h-6 bg-secondary-700 -translate-x-1/2" />
                        )}
                      </div>

                      {/* Storey info */}
                      <div>
                        <h3 className="text-lg font-semibold text-secondary-100">{storey.name}</h3>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-secondary-400 text-sm">
                            Elevation: <span className="text-secondary-200">{formatElevation(storey.elevation)}</span>
                          </span>
                          <span className="text-secondary-600">•</span>
                          <span className="text-secondary-400 text-sm">
                            Elements: <span className="text-secondary-200">{formatNumber(storey.element_count || 0)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Element count indicator */}
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-secondary-100">{formatNumber(storey.element_count || 0)}</p>
                        <p className="text-xs text-secondary-500">elements</p>
                      </div>
                      <div className="w-24 bg-secondary-800 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              ((storey.element_count || 0) / Math.max(...(storeysData?.storeys.map(s => s.element_count || 0) || [1]))) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Visual Building Representation */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle subtitle="Visual representation of building levels">Building Section</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <div className="relative">
                {/* Building silhouette */}
                <div className="flex flex-col-reverse gap-1">
                  {storeysData?.storeys.map((storey, index) => {
                    const maxElements = Math.max(...(storeysData.storeys.map(s => s.element_count || 1)))
                    const widthPercentage = ((storey.element_count || 0) / maxElements) * 100

                    return (
                      <motion.div
                        key={storey.name}
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative group"
                      >
                        <div
                          className={cn(
                            'h-12 rounded-lg bg-gradient-to-r transition-all duration-300',
                            'from-primary-500/40 to-accent-500/40',
                            'hover:from-primary-500/60 hover:to-accent-500/60',
                            'border border-primary-500/20'
                          )}
                          style={{ width: `${Math.max(widthPercentage, 30)}%`, minWidth: 150, maxWidth: 400 }}
                        />
                        <div className="absolute inset-0 flex items-center justify-between px-4">
                          <span className="text-sm font-medium text-secondary-200">{storey.name}</span>
                          <span className="text-xs text-secondary-400">
                            {formatElevation(storey.elevation)}
                          </span>
                        </div>

                        {/* Tooltip */}
                        <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <div className="bg-secondary-800 border border-secondary-700 rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                            <p className="text-secondary-200 font-medium">{storey.name}</p>
                            <p className="text-secondary-400 text-sm">{formatNumber(storey.element_count || 0)} elements</p>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Ground indicator */}
                <div className="h-2 w-full bg-secondary-700 rounded-full mt-2" />
                <p className="text-center text-xs text-secondary-500 mt-1">Ground Level</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
