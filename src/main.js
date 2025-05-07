const core = require('@actions/core')
const {execSync} = require('child_process')

const env = {
  PATH: process.env.PATH,
  FORCE_COLOR: 'true',
  DOTNET_CLI_HOME: '/tmp',
  DOTNET_NOLOGO: 'true',
  HOME: process.env.HOME,
}

function btoa(str) {
  return Buffer.from(str).toString('base64')
}

function generateResult(status, testName, command, message = '', duration, maxScore) {
  let score = status === 'pass' ? maxScore : 0
  core.info(`typeof message: ${typeof message}`)
  if (typeof message === 'string') {
    // Look for a pattern like "X of Y ... passed"
    const match = message.match(/(\d+)\s+of\s+(\d+)\s+.*passed/i)

    if (match) {
      const passed = parseInt(match[1], 10)
      const total = parseInt(match[2], 10)

      if (status === 'pass' && total > 0) {
        score = Math.round((passed / total) * maxScore)
      }
    }
  }

  return {
    version: 1,
    status,
    max_score: maxScore,
    tests: [
      {
        name: testName,
        status,
        score,
        message,
        test_code: command,
        filename: '',
        line_no: 0,
        duration,
      },
    ],
  }
}

function getErrorMessageAndStatus(error, command) {
  if (error.message.includes('ETIMEDOUT')) {
    return {status: 'error', errorMessage: 'Command timed out'}
  }
  if (error.message.includes('command not found')) {
    return {status: 'error', errorMessage: `Unable to locate executable file: ${command}`}
  }
  if (error.message.includes('Command failed')) {
    return {status: 'fail', errorMessage: 'failed with exit code 1'}
  }
  return {status: 'error', errorMessage: error.message}
}

function run() {
  core.info('Starting run')
  const testName = core.getInput('test-name', {required: true})
  const setupCommand = core.getInput('setup-command')
  const command = core.getInput('command', {required: true})
  const timeout = parseFloat(core.getInput('timeout') || 10) * 60000 // Convert to minutes
  const maxScore = parseInt(core.getInput('max-score') || 0)

  let output = ''
  let startTime
  let endTime
  let result

  try {
    if (setupCommand) {
      execSync(setupCommand, {timeout, env, stdio: 'inherit'})
    }
    core.info('Executing command')
    startTime = new Date()
    output = execSync(command, {timeout, env, stdio: 'inherit'})?.toString()
    endTime = new Date()
    core.info('Generating result')
    result = generateResult('pass', testName, command, output, endTime - startTime, maxScore)
  } catch (error) {
    endTime = new Date()
    const {status, errorMessage} = getErrorMessageAndStatus(error, command)
    result = generateResult(status, testName, command, errorMessage, endTime - startTime, maxScore)
  }

  core.setOutput('result', btoa(JSON.stringify(result)))
}

run()
