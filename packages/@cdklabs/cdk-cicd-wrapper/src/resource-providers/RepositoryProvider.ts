// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { IConstruct } from 'constructs';
import { ICodeBuildFactory } from './CodeBuildFactoryProvider';
import {
  INTEGRATION_PHASES,
  RepositoryType,
  GlobalResources,
  ResourceContext,
  IResourceProvider,
  RepositoryConfig,
} from '../common';
import { CodeStarConnectRepositoryStack } from '../stacks';
import { CodeCommitRepositoryStack } from '../stacks/CodeCommitRepositoryStack';

const defaultRepositoryConfig: BaseRepositoryProviderProps = {
  repositoryType: process.env.npm_package_config_repositoryType as RepositoryType,
  name: process.env.npm_package_config_repositoryName || '',
  branch: 'main',
  codeStarConnectionArn: process.env.CODESTAR_CONNECTION_ARN,
  codeGuruReviewer: true,
};

export interface IRepositoryStack extends IConstruct {
  readonly pipelineInput: pipelines.IFileSetProducer;
  readonly pipelineEnvVars: { [key in string]: string };
  readonly repositoryBranch: string;
}

export type RepositoryProvider = IResourceProvider;

export interface BaseRepositoryProviderProps extends RepositoryConfig {
  readonly codeStarConnectionArn?: string;
  readonly codeGuruReviewer?: boolean;
}

export class BasicRepositoryProvider implements RepositoryProvider {
  constructor(readonly config: BaseRepositoryProviderProps = defaultRepositoryConfig) {}

  provide(context: ResourceContext): any {
    const { applicationName, deploymentDefinition, applicationQualifier } = context.blueprintProps;
    const phaseDefinition = context.get(GlobalResources.PHASE)!;

    const codebuildFactory: ICodeBuildFactory = context.get(GlobalResources.CODEBUILD_FACTORY)!;

    switch (this.config.repositoryType) {
      case 'GITHUB': {
        if (!this.config.codeStarConnectionArn) {
          throw new Error('CodeStar connection ARN is required for CodeStarConnection based repository');
        }

        return new CodeStarConnectRepositoryStack(context.scope, `${applicationName}Repository`, {
          env: { account: deploymentDefinition.RES.env.account, region: deploymentDefinition.RES.env.region },
          applicationName: applicationName,
          applicationQualifier: applicationQualifier,
          codeStarConnectionArn: this.config.codeStarConnectionArn,
          ...this.config,
        });
      }
      case 'CODECOMMIT': {
        return new CodeCommitRepositoryStack(context.scope, `${applicationName}Repository`, {
          env: {
            account: deploymentDefinition.RES.env.account,
            region: deploymentDefinition.RES.env.region,
          },
          applicationName: applicationName,
          applicationQualifier: applicationQualifier,
          ...this.config,
          pr: {
            codeGuruReviewer: this.config.codeGuruReviewer || false,
            codeBuildOptions: codebuildFactory.provideCodeBuildOptions(),
            buildSpec: codebuild.BuildSpec.fromObject({
              version: '0.2',
              phases: {
                build: {
                  commands: phaseDefinition.getCommands(...INTEGRATION_PHASES),
                },
              },
            }),
          },
        });
      }
    }
  }
}