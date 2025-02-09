import { GroupManageClient } from './client-component'

export default function GroupManagePage({ params }: { params: { id: string } }) {
  return <GroupManageClient groupId={params.id} />
} 