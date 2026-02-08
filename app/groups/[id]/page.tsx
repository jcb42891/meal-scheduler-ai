import { GroupManageClient } from './client-component'

type GroupPageProps = {
  params: { id: string }
}

export default function GroupManagePage({ params }: GroupPageProps) {
  return <GroupManageClient groupId={params.id} />
}
