import { fakeCameraPath } from './paths'
import { writeFakeCamera } from './fakeCamera'

export default function globalSetup() {
  writeFakeCamera(fakeCameraPath)
}
