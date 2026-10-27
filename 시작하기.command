#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 설치되어 있지 않아요. https://nodejs.org 에서 LTS 버전을 설치해주세요."
  read -n 1 -s -r -p "아무 키나 누르면 닫혀요"
  exit 1
fi
echo "서버를 시작해요. 이 창을 닫으면 서버도 꺼져요."
caffeinate -i node server.js
