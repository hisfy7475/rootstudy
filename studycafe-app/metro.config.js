/* eslint-disable @typescript-eslint/no-require-imports */
// 모노레포 metro 설정: 루트의 shared/ 를 import 가능하게 한다.
// Expo SDK 55 monorepo 패턴. metro 구성은 Node CommonJS 환경에서 평가되므로 require 필수.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 루트의 shared/ 디렉토리를 Metro 감시 대상에 포함.
config.watchFolders = [workspaceRoot];

// RN 의존성은 studycafe-app/node_modules 에서만 찾는다 (루트와 충돌 방지).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
