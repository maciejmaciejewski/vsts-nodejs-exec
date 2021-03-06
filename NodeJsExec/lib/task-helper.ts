import * as tl from 'azure-pipelines-task-lib/task'
import * as hat from 'hat'
import { join, resolve } from 'path'
import { writeFileSync, ensureDirSync } from 'fs-extra'
import * as tr from 'azure-pipelines-task-lib/toolrunner'
import * as check from 'syntax-error'
export class TaskHelper {
  private npmPackageName: string
  private npmPackagePath: string
  private cwd: string
  private dependencies: string
  private script: string
  private npmTool: tr.ToolRunner
  private nodeTool: tr.ToolRunner

  constructor(cwd: string, dependencies: string, script: string) {
    this.cwd = cwd
    this.dependencies = dependencies
    this.script = script

    // Generate random package name
    this.npmPackageName = hat()
    this.npmPackagePath = resolve(join(this.cwd, this.npmPackageName))

    tl.debug(`Package Id = ${this.npmPackageName}`)
    tl.debug(`Package path = ${this.npmPackagePath}`)
    tl.debug('Making package directory')

    // Ensure that package dir exists
    ensureDirSync(this.npmPackagePath)
  }

  private initializeTool(toolName: string): tr.ToolRunner {
    try {
      let tool = tl.tool(tl.which(toolName.toLowerCase(), true))
      return tool
    } catch (error) {
      tl.error(`Failed to install ${toolName} tool which is mandatory to run this task.`)
      throw Error(`Missing ${toolName} tool`)
    }
  }

  private getDefaultExecOptions(): tr.IExecOptions  {
    let execOptions = <tr.IExecOptions>{}
    execOptions.cwd = this.npmPackagePath
    execOptions.failOnStdErr = false
    execOptions.ignoreReturnCode = false
    execOptions.windowsVerbatimArguments = true
    return execOptions
  }

  private prepareNPMPackage(): void {
    tl.debug('Generating package.json file')
    let packageJson = require('./package-template')
    packageJson.name = this.npmPackageName
    let packageJsonPath = join(this.npmPackagePath, 'package.json')

    if (this.dependencies) {
      packageJson.dependencies = JSON.parse(this.dependencies)
    }

    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    this.installDependencies()
  }

  private installDependencies(): void {
    tl.debug('Initializing NPM tool')
    this.npmTool = this.initializeTool('npm')
    this.npmTool.arg('install')

    tl.debug('Running install command')
    const process = this.npmTool.execSync(this.getDefaultExecOptions())
    if(process.code !== 0) {
      throw(new Error('Failed to install dependencies'))
    }
    tl.debug('Finished installing dependencies')
  }

  prepareScriptFile(): void {
    // Check syntactic validity of passed script
    const scriptPath = resolve(join(this.npmPackagePath, 'index.js'))
    let checkResult = check(this.script, scriptPath)

    if (checkResult) {
      tl.error(checkResult.toString())
      throw new Error('Unable to parse script')
    } else {
      tl.debug(`Script contains valid NodeJS code, saving it as ${scriptPath}`)
      writeFileSync(scriptPath, this.script)
    }
  }

  private runScript(): void {
    tl.debug('Running script')
    let npmTool = this.initializeTool('npm')
    npmTool.arg(['start'])

    const process = npmTool.execSync(this.getDefaultExecOptions())
    if(process.code !== 0) {
      throw(new Error('Failed to execute script'))
    }
    tl.debug('Finished NodeJs script execution')
  }

  async runNode(): Promise<void> {
    this.prepareNPMPackage()
    this.prepareScriptFile()
    this.runScript()
  }
}
