import { GroupManageClient } from './client-component'
import { PageProps } from '@/.next/types/app/groups/[id]/page'

type GroupPageProps = PageProps & {
  params: { id: string }
}

export default function GroupManagePage({ params }: GroupPageProps) {
  return <GroupManageClient groupId={params.id} />
} 