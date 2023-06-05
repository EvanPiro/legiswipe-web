module Main exposing (Model, Msg(..), init, main, update, view)

import Bill exposing (Bill, BillRes)
import BillMetadata exposing (BillMetadata, BillMetadataRes)
import Browser exposing (UrlRequest)
import Browser.Navigation as Nav
import CongressApi
import Html.Styled exposing (Html, a, button, div, h1, img, p, text, toUnstyled)
import Html.Styled.Attributes exposing (class, href, src)
import Html.Styled.Events exposing (onClick)
import Http as Http exposing (Error(..))
import Json.Encode as Encode
import List exposing (head)
import LogApi
import Url



---- MODEL ----


type alias Verdict =
    ( Bill, Bool )


type alias Model =
    { activeBill : Maybe Bill
    , bills : List BillMetadata
    , verdicts : List Verdict
    , loading : Bool
    , next : String
    , apiKey : String
    , feedback : String
    , showSponsor : Bool
    }


type alias Flags =
    { apiKey : String
    , maybeModel : Maybe Model
    }


init : Flags -> Url.Url -> Nav.Key -> ( Model, Cmd Msg )
init { apiKey, maybeModel } url key =
    case maybeModel of
        Nothing ->
            ( { activeBill = Nothing
              , bills = []
              , verdicts = []
              , loading = True
              , next = ""
              , apiKey = apiKey
              , feedback = ""
              , showSponsor = False
              }
            , Http.get
                { url = CongressApi.url apiKey
                , expect = Http.expectJson GotBills BillMetadata.decoder
                }
            )

        Just model ->
            ( model, Cmd.none )


getFirstBills : Model -> Cmd Msg
getFirstBills model =
    Http.get
        { url = CongressApi.url model.apiKey
        , expect = Http.expectJson GotBills BillMetadata.decoder
        }


getNextBills : String -> String -> Cmd Msg
getNextBills key url =
    Http.get
        { url = CongressApi.addKey key url
        , expect = Http.expectJson GotBills BillMetadata.decoder
        }


encodeVerdict : Verdict -> Encode.Value
encodeVerdict ( bill, bool ) =
    Encode.object
        [ ( "verdict", Encode.bool bool )
        , ( "bill", Bill.encode bill )
        ]


logVerdict : Verdict -> Cmd Msg
logVerdict verdict =
    Http.post
        { url = LogApi.path
        , body = Http.jsonBody <| encodeVerdict verdict
        , expect = Http.expectWhatever LogRes
        }



---- UPDATE ----


type Msg
    = UrlChanged Url.Url
    | UrlRequested UrlRequest
    | GotBills (Result Http.Error BillMetadataRes)
    | GotBill (Result Http.Error BillRes)
    | SetVerdict Bill Bool
    | LogRes (Result Http.Error ())
    | ShowSponsor


getBill : String -> BillMetadata -> Cmd Msg
getBill key { url } =
    Http.get
        { url = CongressApi.addKey key url
        , expect = Http.expectJson GotBill Bill.decoder
        }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        UrlChanged url ->
            ( model, Cmd.none )

        UrlRequested req ->
            ( model, Cmd.none )

        ShowSponsor ->
            ( { model | showSponsor = True }, Cmd.none )

        LogRes res ->
            ( model, Cmd.none )

        GotBills res ->
            let
                bills =
                    res
                        |> Result.map (\b -> b.bills)
                        |> Result.withDefault []

                next =
                    res
                        |> Result.map (\b -> b.pagination)
                        |> Result.map (\b -> b.next)
                        |> Result.withDefault ""

                reqCmd =
                    case List.head bills of
                        Just bill ->
                            getBill model.apiKey bill

                        _ ->
                            Cmd.none

                newModel =
                    { model | bills = bills, next = next }
            in
            ( newModel, reqCmd )

        GotBill res ->
            case res of
                Err err ->
                    let
                        errorStr =
                            case err of
                                BadBody str ->
                                    str

                                _ ->
                                    "other error"
                    in
                    ( { model | feedback = errorStr }, Cmd.none )

                Ok ok ->
                    let
                        newModel =
                            { model | activeBill = Just ok.bill, showSponsor = False }
                    in
                    ( newModel, Cmd.none )

        SetVerdict bill bool ->
            let
                verdict =
                    ( bill, bool )

                newBills =
                    List.filter (\{ number } -> bill.number /= number) model.bills

                reqCmd =
                    case List.head newBills of
                        Just billMetadata ->
                            getBill model.apiKey billMetadata

                        _ ->
                            getNextBills model.apiKey model.next

                newModel =
                    { model
                        | bills = newBills
                        , activeBill = Nothing
                        , loading = True
                        , verdicts = [ verdict ] ++ model.verdicts
                    }
            in
            ( newModel
            , Cmd.batch [ reqCmd, logVerdict verdict ]
            )



---- VIEW ----


view : Model -> Html Msg
view model =
    div [ class "full-frame" ]
        [ case model.activeBill of
            Nothing ->
                div [ class "mt-1 mx-1 text-center" ]
                    [ text "Loading bill..."
                    ]

            Just bill ->
                div [ class "mt-1 mx-1" ]
                    [ yesNo bill
                    , Bill.view ShowSponsor model.showSponsor bill
                    ]
        , div [ class "flex" ]
            [ div [] [ a [ href "https://github.com/EvanPiro/legiswipe.com" ] [ text "Source Code" ] ]
            , div [] [ a [ href "https://evanpiro.com" ] [ text "© Evan Piro 2023" ] ]
            ]
        ]


yesNo : Bill -> Html Msg
yesNo bill =
    div [ class "flex" ]
        [ button [ class "btn", onClick <| SetVerdict bill False ] [ text "❌" ]
        , button [ class "btn", onClick <| SetVerdict bill True ] [ text "✅" ]
        ]



---- PROGRAM ----


main : Program Flags Model Msg
main =
    Browser.application
        { view = view >> toUnstyled >> (\body -> { title = "legiswipe", body = [ body ] })
        , init = init
        , update = update
        , subscriptions = always Sub.none
        , onUrlRequest = UrlRequested
        , onUrlChange = UrlChanged
        }
