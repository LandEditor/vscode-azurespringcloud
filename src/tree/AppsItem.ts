/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { ViewPropertiesModel } from "@microsoft/vscode-azureresources-api";
import { TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { ext } from "../extensionVariables";
import { EnhancedApp } from '../model/EnhancedApp';
import { EnhancedService } from '../model/EnhancedService';
import * as utils from "../utils";
import { AppItem } from "./AppItem";
import { ResourceItemBase } from "./SpringAppsBranchDataProvider";

export default class AppsItem implements ResourceItemBase {
    private _deleted: boolean;
    private _children: Promise<AppItem[] | undefined>;

    constructor(public readonly service: EnhancedService) {
        this.service = service;
        void this.reloadChildren();
    }

    async getChildren(): Promise<AppItem[]> {
        return await this._children ?? [];
    }

    async getTreeItem(): Promise<TreeItem> {
        const state: string | undefined = (await this.service.properties)?.provisioningState;
        const description = state?.toLowerCase() === 'succeeded' ? undefined : state;
        const tier: string = await this.service.isEnterpriseTier() ? 'enterprise' : await this.service.isConsumptionTier() ? 'consumption' : 'other';
        const contextValue = `azureSpringApps.apps;tier-${tier};`;
        return {
            id: this.id,
            label: this.service.name,
            iconPath: utils.getThemedIconPath('azure-spring-apps'),
            description: description,
            contextValue: contextValue,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        }
    }

    public get id(): string {
        return utils.nonNullProp(this.service, 'id');
    }

    get viewProperties(): ViewPropertiesModel {
        return {
            label: this.service.name,
            data: this.service.remote
        };
    }

    get portalUrl(): Uri {
        return utils.createPortalUrl(this.service.subscription, this.id);
    }

    public get deleted(): boolean {
        return this._deleted;
    }

    public async remove(_context: IActionContext): Promise<void> {
        const description = utils.localize('deleting', 'Deleting...');
        await ext.state.runWithTemporaryDescription(this.id, description, async () => {
            await this.service.remove();
            this._deleted = true;
            ext.branchDataProvider.refresh();
        });
    }

    public async refresh(): Promise<void> {
        if (!this._deleted) {
            await ext.state.runWithTemporaryDescription(this.id, utils.localize('loading', 'Loading...'), async () => {
                await this.service.refresh();
                void this.reloadChildren();
                ext.state.notifyChildrenChanged(this.id);
            });
        }
    }

    public async reloadChildren(): Promise<void> {
        this._children = (async () => {
            const apps: EnhancedApp[] = await this.service.getApps();
            return apps.map(ca => new AppItem(this, ca));
        })();
    }
}
