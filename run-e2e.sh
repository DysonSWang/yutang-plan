#!/bin/bash
cd /home/admin/zhuiai
BASE_URL=http://118.25.94.81:5181 API_BASE=http://118.25.94.81:3005 npx playwright test --reporter=list --timeout=30000
