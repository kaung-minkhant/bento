// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

const SLIDES_MOUNT_PATH = '/slides'

/** Return the public path prefix used by the hosted bento/slides deployment. */
export function hostedMountPath(pathname = location.pathname): string {
  return pathname === SLIDES_MOUNT_PATH || pathname.startsWith(`${SLIDES_MOUNT_PATH}/`)
    ? SLIDES_MOUNT_PATH
    : ''
}

/** Build an origin-relative route for either root-hosted or /slides-hosted use. */
export function hostedRoute(path: `/${string}`, pathname = location.pathname): string {
  return `${hostedMountPath(pathname)}${path}`
}
