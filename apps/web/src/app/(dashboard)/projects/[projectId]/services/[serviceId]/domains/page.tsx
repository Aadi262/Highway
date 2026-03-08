'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { servicesApi } from '@/lib/api'
import { DomainManager } from '@/components/service/DomainManager'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function DomainsPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const [service, setService] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    servicesApi.get(serviceId)
      .then(setService)
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [serviceId])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )
  if (!service) return <div className="p-8 text-muted-foreground">Service not found</div>

  return (
    <div className="p-6">
      <h2 className="text-sm font-medium mb-6">Domains</h2>
      <DomainManager serviceId={serviceId} autoDomain={service.autoDomain} />
    </div>
  )
}
