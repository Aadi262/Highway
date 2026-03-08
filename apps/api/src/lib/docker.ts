import Docker from 'dockerode'
import { env } from './env'

export const docker = new Docker({ socketPath: env.DOCKER_SOCKET })

export async function verifyDockerConnection() {
  const info = await docker.info()
  console.log(`✅ Docker connected — ${info.Containers} containers, ${info.Images} images`)
  return info
}
