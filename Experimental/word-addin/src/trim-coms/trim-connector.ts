import Axios, { AxiosRequestConfig } from "axios";
import { BaseObjectTypes } from "./trim-baseobjecttypes";
import { CommandIds } from "./trim-command-ids";
import TrimMessages from "./trim-messages";

const config = (global as any).config;

const BASE_URI = config.BASE_URL.endsWith("/")
	? config.BASE_URL
	: config.BASE_URL + "/";

export const SERVICEAPI_BASE_URI = BASE_URI + config.SERVICEAPI_PATH;

export type ITokenCallback = (accessToken: string) => void;

export interface ITrimProperty {
	StringValue?: string;
}

export interface ITrimString extends ITrimProperty {
	Value: string;
}

export interface ISearchParamaters {
	trimType: BaseObjectTypes;
	q: string;
	purpose: number;
	purposeExtra?: number;
	start?: number;
	sortBy?: string;
	filter?: string;
}

interface IOptionsInterface {
	accessToken: string;
	path: string;
	method: string;
	data: any;
}

interface IPropertyOrFieldDef {
	Caption: string;
	Id: string;
}

export interface IObjectDetails {
	results: ITrimDetailsObject[];
	propertiesAndFields: IPropertyOrFieldDef[];
}

export interface ISearchResults<T extends ITrimMainObject> {
	hasMoreItems: boolean;
	results: T[];
}

export interface IDriveInformation {
	Id: string;
	Uri: number;
	CommandDefs: ICommandDef[];
}

export interface IIcon {
	FileType: string;
	Id: string;
}

export interface ITrimMainObject {
	Icon?: IIcon;
	Uri: number;
	NameString?: string;
	CommandDefs?: [];
	PossiblyHasSubordinates?: boolean;
	ToolTip?: string;
}

export interface ITrimField {
	StringValue: string;
}

export interface ITrimDetailsObject {
	Uri: number;
	Fields?: { [fieldName: string]: ITrimField };
	[x: string]: any;
}

export interface ILocation extends ITrimMainObject {
	FullFormattedName: ITrimString;
}

export interface IClassification extends ITrimMainObject {
	Name: ITrimString;
}

export interface IRecordType extends ITrimMainObject {}
export interface ICommandDef {
	CommandId: string;
	MenuEntryString: string;
	Tooltip: string;
	StatusBarMessage: string;
	IsEnabled: boolean;
}

export interface ISearchClauseDef {
	Id: string;
	InternalName: string;
	Caption: string;
	ToolTip: string;
}

export interface ISearchOptions {
	StartPointForContainers: string;
	StartPointForLocations: string;
	StartPointRecordDefault: string;
	StartPointDefault: string;
	IncludeAlternateWhenShowingFolderContents: boolean;
	ContentsInReverseDateOrder: boolean;
}

export interface IDatabase {
	CurrencySymbol: string;
}

export interface ITrimConnector {
	credentialsResolver: (callback: ITokenCallback) => void;
	getMe(): Promise<ILocation>;
	getMessages(): Promise<any>;
	getSearchClauseDefinitions(
		trimType: BaseObjectTypes
	): Promise<ISearchClauseDef[]>;
	getSearchOptions(): Promise<ISearchOptions>;
	getDatabaseProperties(): Promise<IDatabase>;
	search<T>(
		options: ISearchParamaters
	): Promise<ISearchResults<ITrimMainObject>>;
	getPropertySheet(recordTypeUri: number): Promise<any>;
	registerInTrim(
		recordTypeUri: number,
		properties: any
	): Promise<ITrimMainObject>;
	getDriveId(webUrl: string): Promise<IDriveInformation>;
	getObjectDetails(
		trimType: BaseObjectTypes,
		uri: number
	): Promise<IObjectDetails>;

	runAction(commandId: CommandIds, Uri: number): Promise<IDriveInformation>;
	makeFriendlySearchQuery(trimType: BaseObjectTypes, query: string): string;
}

export class TrimConnector implements ITrimConnector {
	makeFriendlySearchQuery(trimType: BaseObjectTypes, query: string): string {
		switch (trimType) {
			case BaseObjectTypes.Record:
				return `recAnyWord:${query}* OR recNumber:${query}*`;
			case BaseObjectTypes.Location:
				return `locGivenNames:${query}* OR locSortName:${query}* OR locLogin:${query}*`;
			case BaseObjectTypes.Classification:
				return `plnWord:${query}* OR plnTitle:${query}*`;
			default:
				return `${query}*`;
		}
	}

	private _databaseProperties: IDatabase;
	public getDatabaseProperties(): Promise<IDatabase> {
		if (this._databaseProperties) {
			return new Promise((resolve) => {
				resolve(this._databaseProperties);
			});
		} else {
			return this.makeRequest(
				{
					path: "Database",
					method: "get",
					data: { properties: "DatabaseCurrencySymbol" },
				},
				(data: any) => {
					const prefix = "Database";
					let databaseProperties = {};
					for (var key in data.Results[0]) {
						if (key.startsWith(prefix)) {
							databaseProperties[key.substring(prefix.length)] =
								data.Results[0][key].Value;
						} else {
							databaseProperties[key as string] = data.Results[0][key].Value;
						}
					}

					return (this._databaseProperties = databaseProperties as IDatabase);
				}
			);
		}
	}

	private _searchOptionsCache: ISearchOptions;
	public getSearchOptions(): Promise<ISearchOptions> {
		if (this._searchOptionsCache) {
			return new Promise((resolve) => {
				resolve(this._searchOptionsCache);
			});
		} else {
			return this.makeRequest(
				{ path: "UserOptions/Search", method: "get" },
				(data: any) => {
					const prefix = "SearchUserOptions";
					let searchOptionsCache = {};
					for (var key in data.UserOptions) {
						if (key.startsWith(prefix)) {
							searchOptionsCache[key.substring(prefix.length)] =
								data.UserOptions[key].Value;
						} else {
							searchOptionsCache[key as string] = data.UserOptions[key].Value;
						}
					}

					return (this._searchOptionsCache = searchOptionsCache as ISearchOptions);
				}
			);
		}
	}

	private _searchClauseCache = {};

	public getSearchClauseDefinitions(
		trimType: BaseObjectTypes
	): Promise<ISearchClauseDef[]> {
		const params = {
			TrimType: trimType,
		};

		const cachedResults = this._searchClauseCache[trimType];

		if (cachedResults) {
			return new Promise((resolve) => {
				resolve(cachedResults);
			});
		} else {
			return this.makeRequest(
				{ path: "SearchClauseDef", method: "get", data: params },
				(data: any) => {
					this._searchClauseCache[trimType] = data.SearchClauseDefs;
					return data.SearchClauseDefs;
				}
			);
		}
	}
	public credentialsResolver: (callback: ITokenCallback) => void;

	public runAction(
		commandId: CommandIds,
		Uri: number
	): Promise<IDriveInformation> {
		const path = "DriveFile";

		const postBodies = {
			[CommandIds.RecCheckIn]: { Uri, Action: "checkin" },
			[CommandIds.RecDocFinal]: {
				Action: "finalize",
				Uri,
			},
			[CommandIds.AddToFavorites]: {
				Action: "AddToFavorites",
				Uri,
			},
			[CommandIds.RemoveFromFavorites]: {
				Action: "RemoveFromFavorites",
				Uri,
			},
		};

		return this.makeRequest(
			{ path, method: "post", data: postBodies[commandId] },
			(data: any) => {
				return data.Results[0];
			}
		);
	}

	public getObjectDetails(
		trimType: BaseObjectTypes,
		uri: number
	): Promise<IObjectDetails> {
		const params = {
			includePropertyDefs: true,
			propertySets: "Details",
			propertyValue: "String",
			stringDisplayType: "ViewPane",
		};

		return this.makeRequest(
			{ path: `${trimType}/${uri}`, method: "get", data: params },
			(data: any) => {
				return {
					propertiesAndFields: data.PropertiesAndFields[trimType],
					results: data.Results,
				};
			}
		);
	}

	public getDriveId(webUrl: string): Promise<IDriveInformation> {
		return this.makeRequest(
			{ path: "RegisterFile", method: "get", data: { webUrl } },
			(data: any) => {
				return data.Results[0];
			}
		);
	}

	public registerInTrim(
		recordTypeUri: number,
		properties: any
	): Promise<ITrimMainObject> {
		const body = {
			...properties,
			RecordRecordType: recordTypeUri,
			properties: "CommandDefs",
		};

		return this.makeRequest(
			{ path: "Record", method: "post", data: body },
			(data: any) => {
				return data.Results[0];
			}
		);
	}

	public getPropertySheet(recordTypeUri: number): Promise<any> {
		const params = {
			properties: "dataentryformdefinition",
		};
		return this.makeRequest(
			{ path: `RecordType/${recordTypeUri}`, method: "get", data: params },
			(data: any) => {
				return data.Results[0].DataEntryFormDefinition;
			}
		);
	}

	private _messageCache: any;
	public getMessages(): Promise<any> {
		const params = {
			MatchMessages: Object.keys(new TrimMessages()).join("|"),
		};

		if (this._messageCache) {
			return new Promise((resolve) => {
				resolve(this._messageCache);
			});
		} else {
			return this.makeRequest(
				{ path: "Localisation", method: "get", data: params },
				(data: any) => {
					// temporary - need to go in TRIM Messages
					data.Messages.web_Register = "Register in Content Manager";
					data.Messages.web_SelectRecordType = "Select a Record Type";
					data.Messages.web_Actions = "Actions";
					data.Messages.web_Checkin = "Check In";
					data.Messages.web_Finalize = "Make Final";
					data.Messages.bob_sbMe = "Me";

					this._messageCache = data.Messages;

					return data.Messages;
				}
			);
		}
	}

	public search<T extends ITrimMainObject>(
		options: ISearchParamaters
	): Promise<ISearchResults<T>> {
		const {
			q,
			purpose,
			trimType,
			start,
			purposeExtra,
			sortBy,
			filter,
		} = options;

		const params = {
			pageSize: 20,
			properties: "NameString,PossiblyHasSubordinates,Icon",
			purpose,
			q,
			start,
			ExcludeCount: true,
		};

		if (sortBy) {
			params["sortBy"] = sortBy;
		}

		if (filter) {
			params["filter"] = filter;
		}

		if (purposeExtra) {
			params["purposeExtra"] = purposeExtra;
		}

		if (trimType === BaseObjectTypes.Classification) {
			params.properties += ",Name";
		}

		if (trimType === BaseObjectTypes.Record) {
			params.properties += ",Tooltip";
		}

		params.start = params.start || 1;

		return this.makeRequest(
			{ path: trimType, method: "get", data: params },
			(data: any) => {
				return {
					hasMoreItems: data.HasMoreItems,
					results: data.Results.map((trimObject: T) => {
						let newObject = {};

						for (var key in trimObject) {
							if (key.startsWith(trimType)) {
								newObject[key.substring(trimType.length)] = trimObject[key];
							} else {
								newObject[key as string] = trimObject[key];
							}
						}

						return newObject;
					}),
				};
			}
		);
	}

	public getMe(): Promise<ILocation> {
		const params = {
			properties: "LocationFullFormattedName",
		};

		return this.makeRequest(
			{ path: "Location/me", method: "get", data: params },
			(data: any) => {
				return {
					FullFormattedName: data.Results[0].LocationFullFormattedName,
					Uri: data.Results[0].Uri,
				};
			}
		);
	}

	private makeOptions = (config: IOptionsInterface): AxiosRequestConfig => {
		const headers = { Accept: "application/json", Authorization: "" };

		if (config.accessToken) {
			headers.Authorization = `Bearer ${config.accessToken}`;
		}

		if (config.method === "post") {
			headers["Content-Type"] = "application/json";
		}

		const options = {
			headers,
			method: config.method,
			url: `${SERVICEAPI_BASE_URI}/${config.path}`,
		};

		if (config.method === "post") {
			return { ...options, ...{ data: config.data } };
		} else {
			return { ...options, ...{ params: config.data } };
		}
	};

	private makeRequest<T>(config: any, parseCallback: any): Promise<T> {
		return new Promise((resolve, reject) => {
			this.credentialsResolver((accessToken) => {
				const options = this.makeOptions({ ...{ accessToken }, ...config });

				Axios(options)
					.then((response) => {
						if (
							response.data.CommandDefs ||
							response.data.Messages ||
							response.data.SearchClauseDefs ||
							response.data.UserOptions ||
							response.data.Results
						) {
							resolve(parseCallback(response.data));
						} else {
							reject({ message: "No results found" }); // needs to come from TrimMessages
						}
					})
					.catch((error) => {
						if (error.response) {
							reject({
								message: error.response.data.ResponseStatus.Message,
							});
						} else {
							reject({
								message: error.message,
							});
						}
					});
			});
		});
	}
}

export default TrimConnector;
